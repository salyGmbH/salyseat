<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\Service;

use App\Module\Availability\Application\AvailabilityService;
use App\Module\Venue\Domain\Entity\Venue;

/**
 * Ermittelt konkrete buchbare Uhrzeiten für den WhatsApp-Bot ("welche Zeiten
 * kann ich dem Gast für N Personen anbieten"). AvailabilityService sagt nur,
 * ob das Venue offen ist und welche Tische zu einem GEGEBENEN Zeitpunkt belegt
 * sind — die Enumeration "für welche Uhrzeiten ist noch ein Tisch frei" gibt
 * es bislang nur implizit im Widget-Frontend. Diese Klasse baut sie serverseitig
 * nach, bewusst als eigenständige, kleine Neu-Implementierung (nicht als
 * Wiederverwendung von CreateReservationHandler::findBestTable, da dieser
 * bestehende Code laut Vorgabe unangetastet bleiben soll).
 */
class SlotFinder
{
    public function __construct(
        private readonly AvailabilityService $availabilityService,
    ) {}

    /**
     * @return string[] Liste von 'HH:MM'-Zeiten, zu denen mind. ein Tisch mit
     *                   ausreichend Plätzen frei ist.
     */
    public function findAvailableTimeSlots(
        Venue $venue,
        string $dateStr,
        int $partySize,
        int $intervalMinutes = 30,
    ): array {
        $availability = $this->availabilityService->getAvailability($venue, $dateStr, '');

        if (
            $availability['open'] !== true
            || $availability['open_time'] === null
            || $availability['close_time'] === null
        ) {
            return [];
        }

        $tables = array_values(array_filter(
            $venue->getLayout()['tables'] ?? [],
            static function (array $t) use ($partySize): bool {
                $seats = isset($t['seats']) ? (int) $t['seats'] : 0;
                return $seats >= $partySize;
            },
        ));

        if (empty($tables)) {
            return [];
        }

        $tableNumbers = array_values(array_filter(array_map(
            static fn (array $t) => isset($t['id']) ? (int) $t['id'] : (isset($t['number']) ? (int) $t['number'] : null),
            $tables,
        ), static fn ($n) => $n !== null));

        if (empty($tableNumbers)) {
            return [];
        }

        // Für den ganzen Tag geblockte Tische — konservative Vereinfachung: eine
        // Tischsperre irgendwann am Tag schließt den Tisch für die gesamte
        // Slot-Auflistung aus (statt exakt pro Zeitfenster zu prüfen). Sicher,
        // aber ggf. leicht zu vorsichtig — akzeptabel für v1.
        $blockedTableNumbers = array_map('intval', $availability['blockedTableNumbers'] ?? []);

        $duration = $venue->getDefaultDurationMinutes();

        $slots = [];
        foreach ($this->generateCandidateTimes($availability['open_time'], $availability['close_time'], $availability['breaks'] ?? [], $intervalMinutes) as $time) {
            $slotStart = $this->toMinutes($time);
            $slotEnd   = $slotStart + $duration;

            foreach ($tableNumbers as $num) {
                if (in_array($num, $blockedTableNumbers, true)) {
                    continue;
                }
                if (!$this->isTableOccupied($num, $slotStart, $slotEnd, $availability['bookedPeriods'] ?? [])) {
                    $slots[] = $time;
                    break;
                }
            }
        }

        return $slots;
    }

    /** @param array<int, array{tableNumber:int, from:string, to:string}> $bookedPeriods */
    private function isTableOccupied(int $tableNumber, int $slotStart, int $slotEnd, array $bookedPeriods): bool
    {
        foreach ($bookedPeriods as $p) {
            if ((int) $p['tableNumber'] !== $tableNumber) {
                continue;
            }
            $pStart = $this->toMinutes($p['from']);
            $pEnd   = $this->toMinutes($p['to']);
            if ($pStart < $slotEnd && $pEnd > $slotStart) {
                return true;
            }
        }
        return false;
    }

    /** @param array<int, array{from:string, to:string}> $breaks */
    private function generateCandidateTimes(string $openTime, string $closeTime, array $breaks, int $intervalMinutes): array
    {
        $start = $this->toMinutes($openTime);
        $end   = $this->toMinutes($closeTime);

        $out = [];
        for ($t = $start; $t < $end; $t += $intervalMinutes) {
            $time = $this->fromMinutes($t);

            $inBreak = false;
            foreach ($breaks as $b) {
                if ($time >= ($b['from'] ?? '') && $time < ($b['to'] ?? '')) {
                    $inBreak = true;
                    break;
                }
            }
            if (!$inBreak) {
                $out[] = $time;
            }
        }

        return $out;
    }

    private function toMinutes(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time));
        return $h * 60 + $m;
    }

    private function fromMinutes(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }
}