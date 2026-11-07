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
     * GET /api/v1/widget/availability?venue_id=X&date=YYYY-MM-DD
     */
    #[Route('', name: 'widget_availability_slots', methods: ['GET'])]
    public function getSlots(Request $request): JsonResponse
    {
        $venueId = $request->query->getString('venue_id');
        $dateStr = $request->query->getString('date');

        if ($venueId === '' || $dateStr === '') {
            return $this->json(['error' => 'venue_id und date sind erforderlich.'], Response::HTTP_BAD_REQUEST);
        }

        $venue = $this->em->getRepository(Venue::class)->find($venueId);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        try {
            $date = new \DateTimeImmutable($dateStr);
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum.'], Response::HTTP_BAD_REQUEST);
        }

        // 1. Sondertage prüfen — überschreiben reguläre Zeiten
        $specials = $this->dbal->fetchAllAssociative(
            'SELECT full_day, open_time, close_time, reason
               FROM special_closings
              WHERE venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND date_from <= ?
                AND date_to   >= ?
              ORDER BY date_from ASC',
            [$venueId, $dateStr, $dateStr],
        );

        if (count($specials) > 0) {
            $sc = $specials[0];

            if ((bool) $sc['full_day']) {
                return $this->json([
                    'open'       => false,
                    'open_time'  => null,
                    'close_time' => null,
                    'breaks'     => [],
                    'reason'     => $sc['reason'],
                ]);
            }

            return $this->json([
                'open'       => true,
                'open_time'  => $sc['open_time'],
                'close_time' => $sc['close_time'],
                'breaks'     => [],
                'reason'     => $sc['reason'],
            ]);
        }

        // 2. Reguläre Öffnungszeiten — 0=Montag … 6=Sonntag
        // PHP N: 1=Montag … 7=Sonntag → wir mappen auf 0-6
        $weekday = ((int) $date->format('N')) - 1;

        $oh = $this->ohRepo->findByVenueAndWeekday($venue, $weekday);

        if ($oh === null) {
            return $this->json(['open' => true, 'open_time' => null, 'close_time' => null, 'breaks' => [], 'reason' => null]);
        }

        return $this->json([
            'open'       => $oh->isOpen(),
            'open_time'  => $oh->isOpen() ? $oh->getOpenTime()  : null,
            'close_time' => $oh->isOpen() ? $oh->getCloseTime() : null,
            'breaks'     => $oh->isOpen() ? ($oh->getBreaks() ?? []) : [],
            'reason'     => null,
        ]);
    }
}
