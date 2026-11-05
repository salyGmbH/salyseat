<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Öffentliche API — wird direkt vom Widget aufgerufen.
 * Authentifizierung via X-Public-Key Header (kein JWT).
 */
#[Route('/availability')]
class AvailabilityController extends AbstractController
{
    /**
     * Gibt verfügbare Slots für ein Datum zurück.
     * GET /api/v1/widget/availability?date=2026-11-05&party_size=2
     */
    #[Route('', name: 'widget_availability_slots', methods: ['GET'])]
    public function getSlots(Request $request): JsonResponse
    {
        $date = $request->query->getString('date');
        $partySize = $request->query->getInt('party_size', 2);

        // TODO: AvailabilityCalculator Service aufrufen
        // Vorerst Dummy-Daten für Entwicklung
        $slots = $this->buildDummySlots($date);

        return $this->json([
            'date' => $date,
            'party_size' => $partySize,
            'slots' => $slots,
        ]);
    }

    private function buildDummySlots(string $date): array
    {
        $slots = [];
        $times = ['12:00', '12:30', '13:00', '13:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];

        foreach ($times as $time) {
            $slots[] = [
                'time' => $time,
                'datetime' => $date . 'T' . $time . ':00',
                'available' => true,
                'remaining_capacity' => rand(2, 8),
            ];
        }

        return $slots;
    }
}
