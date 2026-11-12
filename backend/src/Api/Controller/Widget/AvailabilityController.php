<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Availability\Infrastructure\Persistence\DoctrineOpeningHoursRepository;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Öffentliche API — wird direkt vom Widget aufgerufen.
 * Keine Authentifizierung erforderlich.
 */
#[Route('/availability')]
class AvailabilityController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DoctrineOpeningHoursRepository $ohRepo,
        private readonly Connection $dbal,
    ) {}

    /**
     * Gibt Öffnungsinformationen für ein Venue an einem bestimmten Datum zurück.
     * GET /api/v1/widget/availability?venue_id=X&date=YYYY-MM-DD[&time=HH:MM]
     *
     * Immer enthalten:
     *   bookedPeriods  – alle aktiven Reservierungen des Tages mit Zeitfenster + Tischnummer
     *   totalTables    – Anzahl Tische im Venue-Layout (für "vollständig belegt"-Prüfung)
     *
     * Nur wenn &time=HH:MM übergeben wird:
     *   bookedTableNumbers – Tischnummern die im konkreten Slot belegt sind
     */
    #[Route('', name: 'widget_availability_slots', methods: ['GET'])]
    public function getSlots(Request $request): JsonResponse
    {
        $venueId = $request->query->getString('venue_id');
        $dateStr = $request->query->getString('date');
        $timeStr = $request->query->getString('time'); // optional, HH:MM

        if ($venueId === '' || $dateStr === '') {
            return $this->json(['error' => 'venue_id und date sind erforderlich.'], Response::HTTP_BAD_REQUEST);
        }

        $venue = $this->em->getRepository(Venue::class)->find($venueId);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $tenant = $venue->getTenant();

        try {
            $date = new \DateTimeImmutable($dateStr);
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum.'], Response::HTTP_BAD_REQUEST);
        }

        $bookedPeriods = $this->fetchBookedPeriods($venue, $dateStr);
        $totalTables   = count($venue->getLayout()['tables'] ?? []);

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
                return $this->json([
                    'open'               => false,
                    'open_time'          => null,
                    'close_time'         => null,
                    'breaks'             => [],
                    'reason'             => $sc['reason'],
                    'blockedRanges'      => [],
                    'bookedTableNumbers' => [],
                    'bookedPeriods'      => $bookedPeriods,
                    'totalTables'        => $totalTables,
                ]);
            }

            return $this->json([
                'open'               => true,
                'open_time'          => $sc['open_time'],
                'close_time'         => $sc['close_time'],
                'breaks'             => [],
                'reason'             => $sc['reason'],
                'blockedRanges'      => [],
                'bookedTableNumbers' => $this->fetchBookedTableNumbers($venue, $dateStr, $timeStr),
                'bookedPeriods'      => $bookedPeriods,
                'totalTables'        => $totalTables,
            ]);
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
                return $this->json([
                    'open'               => false,
                    'open_time'          => null,
                    'close_time'         => null,
                    'breaks'             => [],
                    'reason'             => $vb['reason'],
                    'blockedRanges'      => [],
                    'bookedTableNumbers' => [],
                    'bookedPeriods'      => $bookedPeriods,
                    'totalTables'        => $totalTables,
                ]);
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
            return $this->json([
                'open'               => true,
                'open_time'          => null,
                'close_time'         => null,
                'breaks'             => [],
                'reason'             => null,
                'blockedRanges'      => $blockedRanges,
                'bookedTableNumbers' => [],
                'bookedPeriods'      => $bookedPeriods,
                'totalTables'        => $totalTables,
            ]);
        }

        return $this->json([
            'open'               => $oh->isOpen(),
            'open_time'          => $oh->isOpen() ? $oh->getOpenTime()  : null,
            'close_time'         => $oh->isOpen() ? $oh->getCloseTime() : null,
            'breaks'             => $oh->isOpen() ? ($oh->getBreaks() ?? []) : [],
            'reason'             => null,
            'blockedRanges'      => $blockedRanges,
            'bookedTableNumbers' => $this->fetchBookedTableNumbers($venue, $dateStr, $timeStr),
            'bookedPeriods'      => $bookedPeriods,
            'totalTables'        => $totalTables,
        ]);
    }

    /**
     * Alle aktiven Reservierungen des Tages mit Tischnummer als Zeitfenster-Liste.
     * Wird vom Frontend genutzt um vollständig belegte Slots auszublenden.
     */
    private function fetchBookedPeriods(Venue $venue, string $dateStr): array
    {
        $rows = $this->dbal->fetchAllAssociative(
            'SELECT r.table_number                      AS tableNumber,
                    DATE_FORMAT(r.starts_at, \'%H:%i\') AS `from`,
                    DATE_FORMAT(r.ends_at,   \'%H:%i\') AS `to`
               FROM reservations r
              WHERE r.venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND r.status NOT IN (\'cancelled\', \'completed\', \'no_show\')
                AND DATE(r.starts_at) = ?',
            [$venue->getId()->toRfc4122(), $dateStr],
        );

        return array_map(fn ($r) => [
            'tableNumber' => (int) $r['tableNumber'],
            'from'        => $r['from'],
            'to'          => $r['to'],
        ], $rows);
    }

    private function fetchBookedTableNumbers(Venue $venue, string $dateStr, string $timeStr): array
    {
        if ($timeStr === '') {
            return [];
        }

        $startsAt = new \DateTimeImmutable("{$dateStr}T{$timeStr}:00");
        $endsAt   = $startsAt->modify(sprintf('+%d minutes', $venue->getDefaultDurationMinutes()));

        $rows = $this->dbal->fetchFirstColumn(
            'SELECT DISTINCT r.table_number
               FROM reservations r
              WHERE r.venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND r.status NOT IN (\'cancelled\', \'completed\', \'no_show\')
                AND r.table_number IS NOT NULL
                AND r.starts_at < ?
                AND r.ends_at   > ?',
            [
                $venue->getId()->toRfc4122(),
                $endsAt->format('Y-m-d H:i:s'),
                $startsAt->format('Y-m-d H:i:s'),
            ],
        );

        return array_map('intval', $rows);
    }
}
