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

    public function __invoke(string $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $tid = Uuid::fromString($tenantId);

        $totals = $this->totals($tid);
        $totals['auslastung'] = $this->auslastung($tid, $from, $to);

        return [
            'totals'    => $totals,
            'timeslots' => $this->timeslots($tid, $from, $to),
            'monthly'   => $this->monthly($tid),
            'topGuests' => $this->topGuests($tid),
        ];
    }

    // ─── Gesamt-KPIs (all-time) ───────────────────────────────────────────────

    private function totals(Uuid $tenantId): array
    {
        $rows = $this->em->createQueryBuilder()
            ->select('r.status, COUNT(r.id) as cnt, COALESCE(SUM(r.partySize), 0) as guests')
            ->from(Reservation::class, 'r')
            ->join('r.venue', 'v')
            ->join('v.tenant', 't')
            ->where('t.id = :tenantId')
            ->groupBy('r.status')
            ->setParameter('tenantId', $tenantId, 'uuid')
            ->getQuery()
            ->getResult();

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

    // ─── Monatliche Reservierungen (letzten 12 Monate) ────────────────────────

    private function monthly(Uuid $tenantId): array
    {
        $conn     = $this->em->getConnection();
        $fromDate = (new \DateTimeImmutable('-12 months'))->format('Y-m-01');

        $rows = $conn->fetchAllAssociative(
            "SELECT DATE_FORMAT(r.starts_at, '%Y-%m') AS month,
                    COUNT(r.id)                        AS cnt,
                    COALESCE(SUM(r.party_size), 0)     AS guests
             FROM reservations r
             INNER JOIN venues  v ON v.id = r.venue_id
             INNER JOIN tenants t ON t.id = v.tenant_id
             WHERE t.id      = UNHEX(REPLACE(:tenantId, '-', ''))
               AND r.starts_at >= :from
               AND r.status NOT IN ('cancelled')
             GROUP BY month
             ORDER BY month",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $fromDate,
            ]
        );

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

    // ─── Hilfsmethode ────────────────────────────────────────────────────────

    private function timeToMinutes(string $time): int
    {
        [$h, $m] = explode(':', $time);
        return (int) $h * 60 + (int) $m;
    }
}
