<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Availability\Application\AvailabilityService;
use App\Module\Venue\Domain\Entity\Venue;
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
        private readonly AvailabilityService $availabilityService,
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

        try {
            new \DateTimeImmutable($dateStr);
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum.'], Response::HTTP_BAD_REQUEST);
        }

        return $this->json($this->availabilityService->getAvailability($venue, $dateStr, $timeStr));
    }
}
