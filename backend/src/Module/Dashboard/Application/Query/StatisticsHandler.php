<?php

declare(strict_types=1);

namespace App\Module\Dashboard\Application\Query;

use App\Module\Availability\Infrastructure\Persistence\DoctrineOpeningHoursRepository;
use App\Module\Reservation\Domain\Entity\Guest;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

final class StatisticsHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DoctrineOpeningHoursRepository $ohRepo,
    ) {}

    public function __invoke(string $tenantId, ?\DateTimeImmutable $from, ?\DateTimeImmutable $to): array
    {
        $tid = Uuid::fromString($tenantId);

        // Fallback für Auslastung wenn kein Zeitraum: aktuelles Jahr
        $auslastungFrom = $from ?? new \DateTimeImmutable('first day of january this year midnight');
        $auslastungTo   = $to   ?? new \DateTimeImmutable('tomorrow midnight');

        $totals = $this->totals($tid, $from, $to);
        $totals['auslastung'] = $this->auslastung($tid, $auslastungFrom, $auslastungTo);

        return [
            'totals'     => $totals,
            'timeslots'  => $this->timeslots($tid, $auslastungFrom, $auslastungTo),
            'monthly'    => $this->monthly($tid, $from, $to),
            'topGuests'  => $this->topGuests($tid),
            'guestTypes' => $this->guestTypes($tid, $from, $to),
            'sources'    => $this->sources($tid, $from, $to),
        ];
    }

    // ─── Gesamt-KPIs (gefiltert nach Zeitraum wenn angegeben) ────────────────

    private function totals(Uuid $tenantId, ?\DateTimeImmutable $from, ?\DateTimeImmutable $to): array
    {
        $qb = $this->em->createQueryBuilder()
            ->select('r.status, COUNT(r.id) as cnt, COALESCE(SUM(r.partySize), 0) as guests')
            ->from(Reservation::class, 'r')
            ->join('r.venue', 'v')
            ->join('v.tenant', 't')
            ->where('t.id = :tenantId')
            ->setParameter('tenantId', $tenantId, 'uuid');

        if ($from !== null) {
            $qb->andWhere('r.startsAt >= :from')->setParameter('from', $from);
        }
        if ($to !== null) {
            $qb->andWhere('r.startsAt < :to')->setParameter('to', $to);
        }

        $rows = $qb->groupBy('r.status')->getQuery()->getResult();

        $totalCount  = 0;
        $totalGuests = 0;
        $noShows     = 0;

        foreach ($rows as $row) {
            if ($row['status'] !== 'cancelled') {
                $totalCount  += (int) $row['cnt'];
                $totalGuests += (int) $row['guests'];
            }
            if ($row['status'] === 'no_show') {
                $noShows = (int) $row['cnt'];
            }
        }

        return [
            'reservations' => $totalCount,
            'guests'       => $totalGuests,
            'noShows'      => $noShows,
        ];
    }

    // ─── Kapazitätsauslastung für den Zeitraum ────────────────────────────────

    private function auslastung(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): float
    {
        // 1. Gesamtsitzplätze aus venue.layout['tables'][].seats
        $totalSeats = $this->totalSeatsFromLayout($tenantId);

        if ($totalSeats === 0) {
            return 0.0;
        }

        // 2. Öffnungszeiten via Repository laden → Netto-Minuten pro Wochentag
        $tenant = $this->em->createQueryBuilder()
            ->select('t')
            ->from(Tenant::class, 't')
            ->where('t.id = :tenantId')
            ->setParameter('tenantId', $tenantId, 'uuid')
            ->getQuery()
            ->getOneOrNullResult();

        if ($tenant === null) {
            return 0.0;
        }

        /** @var \App\Module\Availability\Domain\Entity\OpeningHours[] $ohList */
        $ohList = $this->ohRepo->findByTenant($tenant);

        // Netto-Minuten pro Wochentag (0=Mo … 6=So)
        $netMinutesByWeekday = [];
        foreach ($ohList as $oh) {
            if (!$oh->isOpen() || $oh->getOpenTime() === null || $oh->getCloseTime() === null) {
                continue;
            }
            $net = $this->timeToMinutes($oh->getCloseTime()) - $this->timeToMinutes($oh->getOpenTime());
            foreach ($oh->getBreaks() ?? [] as $break) {
                $net -= $this->timeToMinutes($break['to'] ?? '00:00') - $this->timeToMinutes($break['from'] ?? '00:00');
            }
            $netMinutesByWeekday[$oh->getWeekday()] = max(0, $net);
        }

        // 3. Verfügbare Gesamtminuten über alle Tage im Zeitraum
        $totalAvailableMinutes = 0;
        $day = $from;
        while ($day < $to) {
            $weekday = (int) $day->format('N') - 1; // PHP N: 1=Mo … 7=So → 0–6
            $totalAvailableMinutes += $netMinutesByWeekday[$weekday] ?? 0;
            $day = $day->modify('+1 day');
        }

        if ($totalAvailableMinutes === 0) {
            return 0.0;
        }

        // 4. Tatsächlich genutzte Gäste-Minuten im Zeitraum
        $usedGuestMinutes = (float) $this->em->getConnection()->fetchOne(
            "SELECT COALESCE(SUM(r.party_size * TIMESTAMPDIFF(MINUTE, r.starts_at, r.ends_at)), 0)
             FROM reservations r
             INNER JOIN venues  v ON v.id = r.venue_id
             INNER JOIN tenants t ON t.id = v.tenant_id
             WHERE t.id      = UNHEX(REPLACE(:tenantId, '-', ''))
               AND r.starts_at >= :from
               AND r.starts_at  < :to
               AND r.status NOT IN ('cancelled')",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $from->format('Y-m-d H:i:s'),
                'to'       => $to->format('Y-m-d H:i:s'),
            ]
        );

        // 5. Auslastung = genutzte Gäste-Minuten / (Sitzplätze × verfügbare Minuten)
        $availableGuestMinutes = $totalSeats * $totalAvailableMinutes;

        return round($usedGuestMinutes / $availableGuestMinutes * 100, 1);
    }

    /**
     * Summiert die Sitzplätze aller aktiven Venues des Tenants
     * aus dem layout-JSON-Feld (tables[].seats).
     */
    private function totalSeatsFromLayout(Uuid $tenantId): int
    {
        /** @var Venue[] $venues */
        $venues = $this->em->createQueryBuilder()
            ->select('v')
            ->from(Venue::class, 'v')
            ->join('v.tenant', 't')
            ->where('t.id = :tenantId')
            ->andWhere('v.active = true')
            ->setParameter('tenantId', $tenantId, 'uuid')
            ->getQuery()
            ->getResult();

        $total = 0;
        foreach ($venues as $venue) {
            foreach ($venue->getLayout()['tables'] ?? [] as $table) {
                $total += (int) ($table['seats'] ?? 0);
            }
        }

        return $total;
    }

    // ─── Zeitslot-Verteilung (für den Auslastungs-Balken) ────────────────────

    private function timeslots(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $conn = $this->em->getConnection();
        $rows = $conn->fetchAllAssociative(
            "SELECT DATE_FORMAT(r.starts_at, '%H:%i') AS time_slot,
                    COUNT(r.id)                        AS cnt,
                    COALESCE(SUM(r.party_size), 0)     AS guests
             FROM reservations r
             INNER JOIN venues  v ON v.id = r.venue_id
             INNER JOIN tenants t ON t.id = v.tenant_id
             WHERE t.id      = UNHEX(REPLACE(:tenantId, '-', ''))
               AND r.starts_at >= :from
               AND r.starts_at  < :to
               AND r.status NOT IN ('cancelled')
             GROUP BY time_slot
             ORDER BY time_slot",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $from->format('Y-m-d H:i:s'),
                'to'       => $to->format('Y-m-d H:i:s'),
            ]
        );

        return array_map(fn(array $row) => [
            'time'   => $row['time_slot'],
            'count'  => (int) $row['cnt'],
            'guests' => (int) $row['guests'],
        ], $rows);
    }

    // ─── Monatliche Reservierungen (gefiltert nach Zeitraum) ─────────────────

    private function monthly(Uuid $tenantId, ?\DateTimeImmutable $from, ?\DateTimeImmutable $to): array
    {
        $conn      = $this->em->getConnection();
        $fromDate  = $from?->format('Y-m-01') ?? (new \DateTimeImmutable('-12 months'))->format('Y-m-01');
        $toDate    = $to?->format('Y-m-d H:i:s');

        $sql = "SELECT DATE_FORMAT(r.starts_at, '%Y-%m') AS month,
                        COUNT(r.id)                        AS cnt,
                        COALESCE(SUM(r.party_size), 0)     AS guests
                 FROM reservations r
                 INNER JOIN venues  v ON v.id = r.venue_id
                 INNER JOIN tenants t ON t.id = v.tenant_id
                 WHERE t.id      = UNHEX(REPLACE(:tenantId, '-', ''))
                   AND r.starts_at >= :from
                   AND r.status NOT IN ('cancelled')";

        $params = ['tenantId' => $tenantId->toRfc4122(), 'from' => $fromDate];

        if ($toDate !== null) {
            $sql .= " AND r.starts_at < :to";
            $params['to'] = $toDate;
        }

        $sql .= " GROUP BY month ORDER BY month";

        $rows = $conn->fetchAllAssociative($sql, $params);

        return array_map(fn(array $row) => [
            'month'  => $row['month'],
            'count'  => (int) $row['cnt'],
            'guests' => (int) $row['guests'],
        ], $rows);
    }

    // ─── Top-Gäste (meiste Besuche) ──────────────────────────────────────────

    private function topGuests(Uuid $tenantId): array
    {
        /** @var Guest[] $guests */
        $guests = $this->em->createQueryBuilder()
            ->select('g')
            ->from(Guest::class, 'g')
            ->join('g.tenant', 't')
            ->where('t.id = :tenantId')
            ->andWhere('g.totalReservations > 0')
            ->orderBy('g.totalReservations', 'DESC')
            ->setMaxResults(10)
            ->setParameter('tenantId', $tenantId, 'uuid')
            ->getQuery()
            ->getResult();

        return array_map(fn(Guest $g) => [
            'name'             => $g->getName(),
            'visits'           => $g->getTotalReservations(),
            'noShows'          => $g->getNoShowCount(),
            'reliabilityScore' => $g->getReliabilityScore(),
            'blocked'          => $g->isBlocked(),
        ], $guests);
    }

    // ─── Gästeart: Neukunden vs. Bestandskunden ───────────────────────────────
    // Bestandskunde = guest mit total_reservations > 1

    private function guestTypes(Uuid $tenantId, ?\DateTimeImmutable $from, ?\DateTimeImmutable $to): array
    {
        $conn   = $this->em->getConnection();
        $params = ['tenantId' => $tenantId->toRfc4122()];

        $dateFilter = '';
        if ($from !== null) {
            $dateFilter  .= ' AND r.starts_at >= :from';
            $params['from'] = $from->format('Y-m-d H:i:s');
        }
        if ($to !== null) {
            $dateFilter  .= ' AND r.starts_at < :to';
            $params['to'] = $to->format('Y-m-d H:i:s');
        }

        $row = $conn->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN g.total_reservations <= 1 OR g.id IS NULL THEN 1 ELSE 0 END), 0) AS new_count,
                COALESCE(SUM(CASE WHEN g.total_reservations > 1                              THEN 1 ELSE 0 END), 0) AS returning_count
             FROM reservations r
             LEFT JOIN guests g ON g.id = r.guest_id
             INNER JOIN venues  v ON v.id = r.venue_id
             INNER JOIN tenants t ON t.id = v.tenant_id
             WHERE t.id = UNHEX(REPLACE(:tenantId, '-', ''))
               AND r.status NOT IN ('cancelled', 'no_show')
               {$dateFilter}",
            $params
        );

        $new       = (int) ($row['new_count']       ?? 0);
        $returning = (int) ($row['returning_count'] ?? 0);
        $total     = $new + $returning;

        return [
            'new'            => $new,
            'returning'      => $returning,
            'newPercent'     => $total > 0 ? round($new       / $total * 100, 1) : 0,
            'returningPercent' => $total > 0 ? round($returning / $total * 100, 1) : 0,
        ];
    }

    // ─── Quellen: Online / Manuell / Walk-in ─────────────────────────────────

    private function sources(Uuid $tenantId, ?\DateTimeImmutable $from, ?\DateTimeImmutable $to): array
    {
        $conn   = $this->em->getConnection();
        $params = ['tenantId' => $tenantId->toRfc4122()];

        $dateFilter = '';
        if ($from !== null) { $dateFilter .= ' AND r.starts_at >= :from'; $params['from'] = $from->format('Y-m-d H:i:s'); }
        if ($to   !== null) { $dateFilter .= ' AND r.starts_at < :to';   $params['to']   = $to->format('Y-m-d H:i:s'); }

        $row = $conn->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN r.source = 'online'  THEN 1 ELSE 0 END), 0) AS online_count,
                COALESCE(SUM(CASE WHEN r.source = 'walk_in' THEN 1 ELSE 0 END), 0) AS walk_in_count,
                COALESCE(SUM(CASE WHEN r.source = 'admin' OR r.source IS NULL THEN 1 ELSE 0 END), 0) AS admin_count
             FROM reservations r
             INNER JOIN venues  v ON v.id = r.venue_id
             INNER JOIN tenants t ON t.id = v.tenant_id
             WHERE t.id = UNHEX(REPLACE(:tenantId, '-', ''))
               AND r.status NOT IN ('cancelled', 'no_show')
               {$dateFilter}",
            $params
        );

        $online  = (int) ($row['online_count']  ?? 0);
        $walkIn  = (int) ($row['walk_in_count'] ?? 0);
        $admin   = (int) ($row['admin_count']   ?? 0);
        $total   = $online + $walkIn + $admin;

        $pct = fn(int $n) => $total > 0 ? round($n / $total * 100, 1) : 0.0;

        return [
            'online'  => $online,  'onlinePercent'  => $pct($online),
            'walkIn'  => $walkIn,  'walkInPercent'  => $pct($walkIn),
            'admin'   => $admin,   'adminPercent'   => $pct($admin),
        ];
    }

    // ─── Hilfsmethode ────────────────────────────────────────────────────────

    private function timeToMinutes(string $time): int
    {
        [$h, $m] = explode(':', $time);
        return (int) $h * 60 + (int) $m;
    }
}
