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

        // Fallback für die Auslastungs-% wenn kein Zeitraum gewählt: aktuelles
        // Jahr, aber bewusst nur bis heute — eine Auslastungs-% für noch nicht
        // stattgefundene Tage ergibt keinen Sinn und würde die Zahl sonst
        // künstlich verwässern.
        $auslastungFrom = $from ?? new \DateTimeImmutable('first day of january this year midnight');
        $auslastungTo   = $to   ?? new \DateTimeImmutable('tomorrow midnight');

        // Für die reinen Anzeige-Diagramme (Zeitslots, Stoßzeiten-Ranking) gilt
        // die "bis heute"-Grenze NICHT — hier sollen bereits gebuchte
        // zukünftige Reservierungen mitgezählt werden, wenn kein expliziter
        // Zeitraum gewählt ist. Sonst verschwinden frisch angelegte Buchungen
        // für die kommenden Tage scheinbar spurlos aus der Anzeige.
        $displayFrom = $from ?? new \DateTimeImmutable('first day of january this year midnight');
        $displayTo   = $to   ?? new \DateTimeImmutable('first day of january next year midnight');

        $totals = $this->totals($tid, $from, $to);
        $totals['auslastung'] = $this->auslastung($tid, $auslastungFrom, $auslastungTo);

        return [
            'totals'       => $totals,
            'timeslots'    => $this->timeslots($tid, $displayFrom, $displayTo),
            'monthly'      => $this->monthly($tid, $from, $to),
            'topGuests'    => $this->topGuests($tid),
            'guestTypes'   => $this->guestTypes($tid, $from, $to),
            'sources'      => $this->sources($tid, $from, $to),
            'leadTime'     => $this->leadTime($tid, $from, $to),
            'groupHeatmap' => $this->groupHeatmap($tid, $displayFrom, $displayTo),
            'insights'     => [
                'waitlist'   => $this->waitlistConversion($tid, $displayFrom, $displayTo),
                'topPackage' => $this->topPackage($tid, $displayFrom, $displayTo),
                'mismatch'   => $this->capacityMismatch($tid, $displayFrom, $displayTo),
                'growth'     => $this->growth($tid, $from, $to),
            ],
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

    // ─── Wochentag × Uhrzeit-Heatmap: Ø gleichzeitig anwesende Gäste ─────────
    //
    // Zellwert = durchschnittliche Anzahl gleichzeitig anwesender Gäste für
    // diesen Wochentag+15-Min-Slot, gemittelt über alle Kalendertage dieses
    // Wochentags im Zeitraum (nicht nur Tage mit Reservierungen — ein Tag
    // ohne Gäste zieht den Schnitt bewusst mit runter). Raster: 08:00–24:00,
    // deckt Lunch- und Abendgeschäft ab; Rohdaten werden einmalig geladen und
    // in PHP pro Slot aufsummiert (Overlap-Berechnung, kein GROUP BY möglich
    // da eine Reservierung mehrere Slots gleichzeitig belegt).

    private const HEATMAP_SLOT_START_MIN = 8 * 60;  // 08:00
    private const HEATMAP_SLOT_END_MIN   = 24 * 60; // 24:00 (exklusiv)
    private const HEATMAP_SLOT_SIZE_MIN  = 15;

    private function groupHeatmap(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $slotCount = (int) (
            (self::HEATMAP_SLOT_END_MIN - self::HEATMAP_SLOT_START_MIN) / self::HEATMAP_SLOT_SIZE_MIN
        );

        // 1) Anzahl Kalendertage je Wochentag im Zeitraum — Nenner für den Durchschnitt.
        $daysPerWeekday = array_fill(0, 7, 0);
        $day = $from;
        while ($day < $to) {
            $weekday = ((int) $day->format('N')) - 1; // 0=Mo … 6=So
            $daysPerWeekday[$weekday]++;
            $day = $day->modify('+1 day');
        }

        // 2) Rohdaten: Start/Ende/Personenzahl aller Reservierungen im Zeitraum.
        $rows = $this->em->getConnection()->fetchAllAssociative(
            "SELECT r.starts_at, r.ends_at, r.party_size
               FROM reservations r
               INNER JOIN venues  v ON v.id = r.venue_id
               INNER JOIN tenants t ON t.id = v.tenant_id
              WHERE t.id      = UNHEX(REPLACE(:tenantId, '-', ''))
                AND r.starts_at >= :from
                AND r.starts_at  < :to
                AND r.status NOT IN ('cancelled', 'no_show')",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $from->format('Y-m-d H:i:s'),
                'to'       => $to->format('Y-m-d H:i:s'),
            ]
        );

        // 3) Gästezahl pro Wochentag+Slot aufsummieren (jede Reservierung belegt
        //    alle 15-Min-Slots, die sie überlappt).
        $sums = array_fill(0, 7, array_fill(0, $slotCount, 0));

        foreach ($rows as $row) {
            $startsAt  = new \DateTimeImmutable($row['starts_at']);
            $endsAt    = new \DateTimeImmutable($row['ends_at']);
            $partySize = (int) $row['party_size'];
            $weekday   = ((int) $startsAt->format('N')) - 1;

            $startMin = ((int) $startsAt->format('H')) * 60 + (int) $startsAt->format('i');
            $endMin   = min(
                ((int) $endsAt->format('H')) * 60 + (int) $endsAt->format('i'),
                self::HEATMAP_SLOT_END_MIN,
            );

            $firstSlot = (int) floor(($startMin - self::HEATMAP_SLOT_START_MIN) / self::HEATMAP_SLOT_SIZE_MIN);
            $lastSlot  = (int) ceil(($endMin - self::HEATMAP_SLOT_START_MIN) / self::HEATMAP_SLOT_SIZE_MIN) - 1;

            for ($s = max(0, $firstSlot); $s <= min($lastSlot, $slotCount - 1); $s++) {
                $sums[$weekday][$s] += $partySize;
            }
        }

        // 4) Durchschnitt + Slot-Labels.
        $labels = [];
        for ($s = 0; $s < $slotCount; $s++) {
            $minutes  = self::HEATMAP_SLOT_START_MIN + $s * self::HEATMAP_SLOT_SIZE_MIN;
            $labels[] = sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
        }

        $weekdayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
        $heatmapRows  = [];
        for ($w = 0; $w < 7; $w++) {
            $denom  = $daysPerWeekday[$w];
            $values = [];
            for ($s = 0; $s < $slotCount; $s++) {
                $values[] = $denom > 0 ? round($sums[$w][$s] / $denom, 1) : 0.0;
            }
            $heatmapRows[] = ['weekday' => $weekdayNames[$w], 'values' => $values];
        }

        return ['labels' => $labels, 'rows' => $heatmapRows];
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

    // ─── Buchungsvorlauf: Last-Minute / Kurzfristig / Geplant / Langfristig ──
    // Abstand zwischen Buchungszeitpunkt (created_at) und Termin (starts_at) —
    // zeigt, ob Gäste eher spontan oder im Voraus reservieren.

    private function leadTime(Uuid $tenantId, ?\DateTimeImmutable $from, ?\DateTimeImmutable $to): array
    {
        $conn   = $this->em->getConnection();
        $params = ['tenantId' => $tenantId->toRfc4122()];

        $dateFilter = '';
        if ($from !== null) { $dateFilter .= ' AND r.starts_at >= :from'; $params['from'] = $from->format('Y-m-d H:i:s'); }
        if ($to   !== null) { $dateFilter .= ' AND r.starts_at < :to';   $params['to']   = $to->format('Y-m-d H:i:s'); }

        $row = $conn->fetchAssociative(
            "SELECT
                COALESCE(SUM(CASE WHEN h < 24                THEN 1 ELSE 0 END), 0) AS last_minute_count,
                COALESCE(SUM(CASE WHEN h >= 24  AND h < 72    THEN 1 ELSE 0 END), 0) AS short_term_count,
                COALESCE(SUM(CASE WHEN h >= 72  AND h < 336   THEN 1 ELSE 0 END), 0) AS planned_count,
                COALESCE(SUM(CASE WHEN h >= 336               THEN 1 ELSE 0 END), 0) AS long_term_count
             FROM (
                SELECT GREATEST(0, TIMESTAMPDIFF(HOUR, r.created_at, r.starts_at)) AS h
                  FROM reservations r
                  INNER JOIN venues  v ON v.id = r.venue_id
                  INNER JOIN tenants t ON t.id = v.tenant_id
                 WHERE t.id = UNHEX(REPLACE(:tenantId, '-', ''))
                   AND r.status NOT IN ('cancelled', 'no_show')
                   {$dateFilter}
             ) sub",
            $params
        );

        $lastMinute = (int) ($row['last_minute_count'] ?? 0);
        $shortTerm  = (int) ($row['short_term_count']  ?? 0);
        $planned    = (int) ($row['planned_count']     ?? 0);
        $longTerm   = (int) ($row['long_term_count']   ?? 0);
        $total      = $lastMinute + $shortTerm + $planned + $longTerm;

        $pct = fn(int $n) => $total > 0 ? round($n / $total * 100, 1) : 0.0;

        return [
            'lastMinute' => $lastMinute, 'lastMinutePercent' => $pct($lastMinute),
            'shortTerm'  => $shortTerm,  'shortTermPercent'  => $pct($shortTerm),
            'planned'    => $planned,    'plannedPercent'    => $pct($planned),
            'longTerm'   => $longTerm,   'longTermPercent'   => $pct($longTerm),
        ];
    }

    // ─── Verpasste Nachfrage: Wartelisten-Conversion ─────────────────────────
    // Wie viele Wartelisten-Einträge (Gäste, die sich für einen ausgebuchten
    // Slot eingetragen haben) tatsächlich einen Tisch bekommen haben — zeigt
    // konkret entgangenes Geschäft durch fehlende Kapazität.

    private function waitlistConversion(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT
                COUNT(*)                                                              AS total,
                COALESCE(SUM(CASE WHEN w.status = 'converted' THEN 1 ELSE 0 END), 0)  AS converted,
                COALESCE(SUM(w.party_size), 0)                                        AS total_guests,
                COALESCE(SUM(CASE WHEN w.status = 'converted' THEN w.party_size ELSE 0 END), 0) AS converted_guests
             FROM waitlist_entries w
             WHERE w.tenant_id   = UNHEX(REPLACE(:tenantId, '-', ''))
               AND w.requested_at >= :from
               AND w.requested_at  < :to",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $from->format('Y-m-d H:i:s'),
                'to'       => $to->format('Y-m-d H:i:s'),
            ]
        );

        $total           = (int) ($row['total'] ?? 0);
        $converted       = (int) ($row['converted'] ?? 0);
        $totalGuests     = (int) ($row['total_guests'] ?? 0);
        $convertedGuests = (int) ($row['converted_guests'] ?? 0);

        return [
            'total'           => $total,
            'converted'       => $converted,
            'missed'          => $total - $converted,
            'missedGuests'    => $totalGuests - $convertedGuests,
            'conversionRate'  => $total > 0 ? round($converted / $total * 100, 1) : null,
        ];
    }

    // ─── Top-Package: meistgebuchtes Zusatzpaket ─────────────────────────────

    private function topPackage(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): ?array
    {
        $row = $this->em->getConnection()->fetchAssociative(
            "SELECT rp.package_name AS name, COALESCE(SUM(rp.quantity), 0) AS qty
               FROM reservation_packages rp
               INNER JOIN reservations r ON r.id = rp.reservation_id
               INNER JOIN venues       v ON v.id = r.venue_id
               INNER JOIN tenants      t ON t.id = v.tenant_id
              WHERE t.id        = UNHEX(REPLACE(:tenantId, '-', ''))
                AND r.status   NOT IN ('cancelled')
                AND r.starts_at >= :from
                AND r.starts_at  < :to
              GROUP BY rp.package_name
              ORDER BY qty DESC
              LIMIT 1",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $from->format('Y-m-d H:i:s'),
                'to'       => $to->format('Y-m-d H:i:s'),
            ]
        );

        if ($row === false || (int) $row['qty'] === 0) {
            return null;
        }

        return [
            'name'     => trim((string) $row['name']),
            'quantity' => (int) $row['qty'],
        ];
    }

    // ─── Tisch-Bedarf vs. Angebot ─────────────────────────────────────────────
    // Welche Personenzahl-Gruppe (1-2 / 3-4 / 5-6 / 7+) am häufigsten angefragt
    // wird, verglichen mit der Anzahl passender Tische im Venue-Layout.

    private function capacityMismatch(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): ?array
    {
        $rows = $this->em->getConnection()->fetchAllAssociative(
            "SELECT r.party_size, COUNT(*) AS cnt
               FROM reservations r
               INNER JOIN venues  v ON v.id = r.venue_id
               INNER JOIN tenants t ON t.id = v.tenant_id
              WHERE t.id       = UNHEX(REPLACE(:tenantId, '-', ''))
                AND r.status  NOT IN ('cancelled')
                AND r.starts_at >= :from
                AND r.starts_at  < :to
              GROUP BY r.party_size",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $from->format('Y-m-d H:i:s'),
                'to'       => $to->format('Y-m-d H:i:s'),
            ]
        );

        if (empty($rows)) {
            return null;
        }

        $bucketOf = static function (int $size): string {
            if ($size <= 2) return '1-2';
            if ($size <= 4) return '3-4';
            if ($size <= 6) return '5-6';
            return '7+';
        };

        $demandByBucket = ['1-2' => 0, '3-4' => 0, '5-6' => 0, '7+' => 0];
        foreach ($rows as $row) {
            $demandByBucket[$bucketOf((int) $row['party_size'])] += (int) $row['cnt'];
        }

        arsort($demandByBucket);
        $topBucket = (string) array_key_first($demandByBucket);
        $topDemand = $demandByBucket[$topBucket];

        if ($topDemand === 0) {
            return null;
        }

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

        $tableCount = 0;
        foreach ($venues as $venue) {
            foreach ($venue->getLayout()['tables'] ?? [] as $table) {
                $seats = (int) ($table['seats'] ?? 0);
                if ($seats > 0 && $bucketOf($seats) === $topBucket) {
                    $tableCount++;
                }
            }
        }

        return [
            'bucket'     => $topBucket,
            'demand'     => $topDemand,
            'tableCount' => $tableCount,
        ];
    }

    // ─── Wachstum ggü. Vorperiode ─────────────────────────────────────────────
    // Vergleicht die Reservierungszahl des gewählten Zeitraums mit der
    // unmittelbar vorangehenden Periode gleicher Länge.

    private function growth(Uuid $tenantId, ?\DateTimeImmutable $from, ?\DateTimeImmutable $to): ?array
    {
        $curFrom = $from ?? new \DateTimeImmutable('first day of january this year midnight');
        $curTo   = $to   ?? new \DateTimeImmutable('tomorrow midnight');

        $lengthDays = (int) $curFrom->diff($curTo)->days;
        if ($lengthDays <= 0) {
            return null;
        }

        $prevTo   = $curFrom;
        $prevFrom = $curFrom->modify("-{$lengthDays} days");

        $current  = $this->countReservations($tenantId, $curFrom, $curTo);
        $previous = $this->countReservations($tenantId, $prevFrom, $prevTo);

        return [
            'current'       => $current,
            'previous'      => $previous,
            'growthPercent' => $previous > 0 ? round((($current - $previous) / $previous) * 100, 1) : null,
        ];
    }

    private function countReservations(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): int
    {
        return (int) $this->em->getConnection()->fetchOne(
            "SELECT COUNT(*)
               FROM reservations r
               INNER JOIN venues  v ON v.id = r.venue_id
               INNER JOIN tenants t ON t.id = v.tenant_id
              WHERE t.id       = UNHEX(REPLACE(:tenantId, '-', ''))
                AND r.status  NOT IN ('cancelled')
                AND r.starts_at >= :from
                AND r.starts_at  < :to",
            [
                'tenantId' => $tenantId->toRfc4122(),
                'from'     => $from->format('Y-m-d H:i:s'),
                'to'       => $to->format('Y-m-d H:i:s'),
            ]
        );
    }

    // ─── Hilfsmethode ────────────────────────────────────────────────────────

    private function timeToMinutes(string $time): int
    {
        [$h, $m] = explode(':', $time);
        return (int) $h * 60 + (int) $m;
    }
}
