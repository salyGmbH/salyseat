<?php

declare(strict_types=1);

namespace App\Module\Availability\Application;

use App\Module\Availability\Infrastructure\Persistence\DoctrineOpeningHoursRepository;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\DBAL\Connection;

/**
 * Verfügbarkeitsberechnung für ein Venue an einem bestimmten Datum —
 * extrahiert aus AvailabilityController (Widget), damit dieselbe Logik auch
 * von anderen Kanälen (z. B. dem WhatsApp-Bot) genutzt werden kann.
 *
 * Die Methoden hier sind wortwörtlich aus dem Controller übernommen, nur
 * `$this->json([...])` wurde durch reine Array-Returns ersetzt — das
 * Antwortformat ist unverändert identisch zu vorher.
 */
class AvailabilityService
{
    public function __construct(
        private readonly DoctrineOpeningHoursRepository $ohRepo,
        private readonly Connection $dbal,
    ) {}

    /**
     * Gibt Öffnungsinformationen für ein Venue an einem bestimmten Datum zurück.
     *
     * Immer enthalten:
     *   bookedPeriods  – alle aktiven Reservierungen des Tages mit Zeitfenster + Tischnummer
     *   totalTables    – Anzahl Tische im Venue-Layout (für "vollständig belegt"-Prüfung)
     *
     * Nur wenn $timeStr übergeben wird:
     *   bookedTableNumbers – Tischnummern die im konkreten Slot belegt sind
     */
    public function getAvailability(Venue $venue, string $dateStr, string $timeStr): array
    {
        $tenant = $venue->getTenant();

        $date = new \DateTimeImmutable($dateStr);

        $bookedPeriods        = $this->fetchBookedPeriods($venue, $dateStr);
        $blockedTableNumbers  = $this->fetchBlockedTableNumbers($venue, $dateStr, $timeStr);
        $totalTables          = count($venue->getLayout()['tables'] ?? []);

        // 1. Sondertage prüfen — überschreiben reguläre Zeiten
        $specials = $this->dbal->fetchAllAssociative(
            'SELECT full_day, open_time, close_time, reason
               FROM special_closings
              WHERE tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND date_from <= ?
                AND date_to   >= ?
              ORDER BY date_from ASC',
            [$tenant->getId()->toRfc4122(), $dateStr, $dateStr],
        );

        if (count($specials) > 0) {
            $sc = $specials[0];

            if ((bool) $sc['full_day']) {
                return [
                    'open'                 => false,
                    'open_time'            => null,
                    'close_time'           => null,
                    'breaks'               => [],
                    'reason'               => $sc['reason'],
                    'blockedRanges'        => [],
                    'bookedTableNumbers'   => [],
                    'blockedTableNumbers'  => $blockedTableNumbers,
                    'bookedPeriods'        => $bookedPeriods,
                    'totalTables'          => $totalTables,
                ];
            }

            return [
                'open'                 => true,
                'open_time'            => $sc['open_time'],
                'close_time'           => $sc['close_time'],
                'breaks'               => [],
                'reason'               => $sc['reason'],
                'blockedRanges'        => [],
                'bookedTableNumbers'   => $this->fetchBookedTableNumbers($venue, $dateStr, $timeStr),
                'blockedTableNumbers'  => $blockedTableNumbers,
                'bookedPeriods'        => $bookedPeriods,
                'totalTables'          => $totalTables,
            ];
        }

        // 1b. Raumspezifische Sperrzeiten prüfen
        $venueBlocks = $this->dbal->fetchAllAssociative(
            'SELECT full_day, time_from, time_to, reason
               FROM venue_blocks
              WHERE venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND date_from <= ?
                AND date_to   >= ?
              ORDER BY date_from ASC',
            [$venue->getId()->toRfc4122(), $dateStr, $dateStr],
        );

        // Ganztägige Sperrung?
        foreach ($venueBlocks as $vb) {
            if ((bool) $vb['full_day']) {
                return [
                    'open'                => false,
                    'open_time'           => null,
                    'close_time'          => null,
                    'breaks'              => [],
                    'reason'              => $vb['reason'],
                    'blockedRanges'       => [],
                    'bookedTableNumbers'  => [],
                    'blockedTableNumbers' => $blockedTableNumbers,
                    'bookedPeriods'       => $bookedPeriods,
                    'totalTables'         => $totalTables,
                ];
            }
        }

        // Zeitfenster-Sperren sammeln (für die Antwort)
        $blockedRanges = array_values(array_filter(
            array_map(fn ($vb) => !$vb['full_day'] && $vb['time_from'] && $vb['time_to']
                ? ['from' => $vb['time_from'], 'to' => $vb['time_to']]
                : null,
                $venueBlocks
            )
        ));

        // 2. Reguläre Öffnungszeiten — 0=Montag … 6=Sonntag
        $weekday = ((int) $date->format('N')) - 1;

        $oh = $this->ohRepo->findByTenantAndWeekday($tenant, $weekday);

        if ($oh === null) {
            return [
                'open'                => true,
                'open_time'           => null,
                'close_time'          => null,
                'breaks'              => [],
                'reason'              => null,
                'blockedRanges'       => $blockedRanges,
                'bookedTableNumbers'  => [],
                'blockedTableNumbers' => $blockedTableNumbers,
                'bookedPeriods'       => $bookedPeriods,
                'totalTables'         => $totalTables,
            ];
        }

        return [
            'open'                => $oh->isOpen(),
            'open_time'           => $oh->isOpen() ? $oh->getOpenTime()  : null,
            'close_time'          => $oh->isOpen() ? $oh->getCloseTime() : null,
            'breaks'              => $oh->isOpen() ? ($oh->getBreaks() ?? []) : [],
            'reason'              => null,
            'blockedRanges'       => $blockedRanges,
            'bookedTableNumbers'  => $this->fetchBookedTableNumbers($venue, $dateStr, $timeStr),
            'blockedTableNumbers' => $blockedTableNumbers,
            'bookedPeriods'       => $bookedPeriods,
            'totalTables'         => $totalTables,
        ];
    }

    /**
     * Alle aktiven Reservierungen des Tages mit Tischnummer als Zeitfenster-Liste.
     * Wird vom Frontend genutzt um vollständig belegte Slots auszublenden.
     */
    private function fetchBookedPeriods(Venue $venue, string $dateStr): array
    {
        $rows = $this->dbal->fetchAllAssociative(
            'SELECT r.table_number                      AS tableNumber,
                    r.table_ids                          AS tableIds,
                    DATE_FORMAT(r.starts_at, \'%H:%i\') AS `from`,
                    DATE_FORMAT(r.ends_at,   \'%H:%i\') AS `to`
               FROM reservations r
              WHERE r.venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND r.status NOT IN (\'cancelled\', \'completed\', \'no_show\')
                AND DATE(r.starts_at) = ?',
            [$venue->getId()->toRfc4122(), $dateStr],
        );

        $periods = [];
        foreach ($rows as $r) {
            foreach ($this->resolveTableNumbers($r['tableNumber'], $r['tableIds']) as $tableNumber) {
                $periods[] = [
                    'tableNumber' => $tableNumber,
                    'from'        => $r['from'],
                    'to'          => $r['to'],
                ];
            }
        }

        return $periods;
    }

    /**
     * Liefert alle Tischnummern einer Reservierung. Bei zusammengelegten
     * Tischen (Mehrfach-Tischauswahl, gespeichert in table_ids als JSON-Array)
     * werden ALLE Tische zurückgegeben, nicht nur der erste (table_number) —
     * sonst gilt ein Venue fälschlich als "noch frei", obwohl eine einzelne
     * Reservierung bereits mehrere/alle Tische belegt.
     */
    private function resolveTableNumbers(mixed $tableNumber, mixed $tableIdsJson): array
    {
        $tableIds = [];
        if ($tableIdsJson !== null && $tableIdsJson !== '') {
            $decoded = json_decode((string) $tableIdsJson, true);
            if (is_array($decoded) && count($decoded) > 0) {
                $tableIds = array_values(array_unique(array_map('intval', $decoded)));
            }
        }

        if (count($tableIds) > 0) {
            return $tableIds;
        }

        return ($tableNumber !== null && $tableNumber !== '') ? [(int) $tableNumber] : [];
    }

    private function fetchBlockedTableNumbers(Venue $venue, string $dateStr, string $timeStr): array
    {
        if ($timeStr !== '') {
            // Nicht nur den Startzeitpunkt prüfen, sondern das volle Zeitfenster
            // der Reservierung [Start, Ende) gegen die Sperrzeit — sonst würde
            // eine Sperre wie 20:30–21:00 eine um 20:00 beginnende, bis 21:30
            // laufende Reservierung nicht erkennen, obwohl sie in die Sperrzeit
            // hineinragt. Dieselbe Dauer-Annahme wie bei fetchBookedTableNumbers()
            // (Effective-Default-Dauer, ohne Clean-up-Puffer — die Sperre selbst
            // markiert den Tisch bereits explizit als gesperrt, kein zusätzlicher
            // Puffer nötig).
            $startsAt   = new \DateTimeImmutable("{$dateStr}T{$timeStr}:00");
            $endsAt     = $startsAt->modify(sprintf('+%d minutes', $venue->getEffectiveDefaultDurationMinutes()));
            $endTimeStr = $endsAt->format('Y-m-d') === $dateStr ? $endsAt->format('H:i') : '24:00';

            $rows = $this->dbal->fetchFirstColumn(
                'SELECT DISTINCT table_number
                   FROM table_blocks
                  WHERE venue_id  = UNHEX(REPLACE(?, \'-\', \'\'))
                    AND date_from <= ?
                    AND date_to   >= ?
                    AND (full_day = 1 OR (time_from < ? AND time_to > ?))',
                [$venue->getId()->toRfc4122(), $dateStr, $dateStr, $endTimeStr, $timeStr],
            );
        } else {
            $rows = $this->dbal->fetchFirstColumn(
                'SELECT DISTINCT table_number
                   FROM table_blocks
                  WHERE venue_id  = UNHEX(REPLACE(?, \'-\', \'\'))
                    AND date_from <= ?
                    AND date_to   >= ?',
                [$venue->getId()->toRfc4122(), $dateStr, $dateStr],
            );
        }

        return array_map('intval', $rows);
    }

    private function fetchBookedTableNumbers(Venue $venue, string $dateStr, string $timeStr): array
    {
        if ($timeStr === '') {
            return [];
        }

        $startsAt = new \DateTimeImmutable("{$dateStr}T{$timeStr}:00");
        $endsAt   = $startsAt->modify(sprintf('+%d minutes', $venue->getEffectiveDefaultDurationMinutes()));

        // Clean-up-Zeit symmetrisch auf beide Seiten des gesuchten Fensters anwenden —
        // hält den Puffer zu jeder Nachbar-Reservierung ein, egal ob davor oder danach.
        // cleanupMinutes=0 (Schalter aus) ergibt exakt die bisherige Abfrage.
        $cleanupMinutes = $this->cleanupMinutes($venue);
        $windowStart    = $cleanupMinutes > 0 ? $startsAt->modify("-{$cleanupMinutes} minutes") : $startsAt;
        $windowEnd      = $cleanupMinutes > 0 ? $endsAt->modify("+{$cleanupMinutes} minutes")   : $endsAt;

        $rows = $this->dbal->fetchAllAssociative(
            'SELECT r.table_number AS tableNumber,
                    r.table_ids    AS tableIds
               FROM reservations r
              WHERE r.venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND r.status NOT IN (\'cancelled\', \'completed\', \'no_show\')
                AND (r.table_number IS NOT NULL OR r.table_ids IS NOT NULL)
                AND r.starts_at < ?
                AND r.ends_at   > ?',
            [
                $venue->getId()->toRfc4122(),
                $windowEnd->format('Y-m-d H:i:s'),
                $windowStart->format('Y-m-d H:i:s'),
            ],
        );

        $tableNumbers = [];
        foreach ($rows as $r) {
            foreach ($this->resolveTableNumbers($r['tableNumber'], $r['tableIds']) as $tableNumber) {
                $tableNumbers[$tableNumber] = true;
            }
        }

        return array_keys($tableNumbers);
    }

    /** Clean-up-Zeit in Minuten — 0 wenn der Schalter in den Tenant-Settings aus ist. */
    private function cleanupMinutes(Venue $venue): int
    {
        $timing = $venue->getTenant()->getUiSettings()['reservationTiming'] ?? [];
        if (empty($timing['cleanupEnabled'])) {
            return 0;
        }
        return (int) ($timing['cleanupMinutes'] ?? 0);
    }
}
