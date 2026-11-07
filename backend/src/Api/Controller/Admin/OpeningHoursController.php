<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Availability\Domain\Entity\OpeningHours;
use App\Module\Availability\Domain\Entity\SpecialClosing;
use App\Module\Availability\Infrastructure\Persistence\DoctrineOpeningHoursRepository;
use App\Module\Availability\Infrastructure\Persistence\DoctrineSpecialClosingRepository;
use App\Module\User\Domain\Entity\User;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/venues/{venueId}')]
class OpeningHoursController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DoctrineOpeningHoursRepository $ohRepo,
        private readonly DoctrineSpecialClosingRepository $scRepo,
    ) {}

    // ── Öffnungszeiten ────────────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/venues/{venueId}/opening-hours
     * Gibt alle 7 Wochentage zurück (legt Defaults an wenn noch keine existieren).
     */
    #[Route('/opening-hours', name: 'admin_opening_hours_get', methods: ['GET'])]
    public function getHours(string $venueId, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->resolveVenue($venueId, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $existing = $this->ohRepo->findByVenue($venue);
        $byDay    = [];
        foreach ($existing as $oh) {
            $byDay[$oh->getWeekday()] = $oh;
        }

        // Fehlende Wochentage mit Defaults auffüllen (ohne persistieren)
        $result = [];
        for ($d = 0; $d <= 6; $d++) {
            if (isset($byDay[$d])) {
                $result[] = $this->serializeHours($byDay[$d]);
            } else {
                $result[] = [
                    'weekday'    => $d,
                    'open'       => false,
                    'open_time'  => null,
                    'close_time' => null,
                    'breaks'     => [],
                ];
            }
        }

        return $this->json($result);
    }

    /**
     * PUT /api/v1/admin/venues/{venueId}/opening-hours
     * Speichert alle 7 Wochentage auf einmal (Upsert).
     */
    #[Route('/opening-hours', name: 'admin_opening_hours_put', methods: ['PUT'])]
    public function putHours(string $venueId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->resolveVenue($venueId, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Ungültiges JSON.'], Response::HTTP_BAD_REQUEST);
        }

        $existing = $this->ohRepo->findByVenue($venue);
        $byDay    = [];
        foreach ($existing as $oh) {
            $byDay[$oh->getWeekday()] = $oh;
        }

        foreach ($data as $entry) {
            $weekday = (int) ($entry['weekday'] ?? -1);
            if ($weekday < 0 || $weekday > 6) continue;

            $oh = $byDay[$weekday] ?? new OpeningHours($venue, $weekday);

            $isOpen = (bool) ($entry['open'] ?? false);
            $oh->setOpen($isOpen);

            if ($isOpen) {
                $openTime  = trim((string) ($entry['open_time']  ?? ''));
                $closeTime = trim((string) ($entry['close_time'] ?? ''));
                if ($openTime !== '' && $closeTime !== '') {
                    try {
                        $oh->setHours($openTime, $closeTime);
                    } catch (\InvalidArgumentException $e) {
                        return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
                    }
                }

                $breaks = $entry['breaks'] ?? [];
                $oh->setBreaks(is_array($breaks) && count($breaks) > 0 ? $breaks : null);
            }

            $this->em->persist($oh);
        }

        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    // ── Sondertage ────────────────────────────────────────────────────────────

    /**
     * GET /api/v1/admin/venues/{venueId}/special-closings
     */
    #[Route('/special-closings', name: 'admin_special_closings_list', methods: ['GET'])]
    public function listClosings(string $venueId, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->resolveVenue($venueId, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json(
            array_map($this->serializeClosing(...), $this->scRepo->findByVenue($venue))
        );
    }

    /**
     * POST /api/v1/admin/venues/{venueId}/special-closings
     */
    #[Route('/special-closings', name: 'admin_special_closings_create', methods: ['POST'])]
    public function createClosing(string $venueId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->resolveVenue($venueId, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        try {
            $dateFrom = new \DateTimeImmutable((string) ($data['date_from'] ?? ''));
            $dateTo   = new \DateTimeImmutable((string) ($data['date_to']   ?? ''));
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $fullDay = (bool) ($data['full_day'] ?? true);

        try {
            $sc = new SpecialClosing(
                venue:    $venue,
                dateFrom: $dateFrom,
                dateTo:   $dateTo,
                reason:   ($data['reason'] ?? '') !== '' ? trim((string) $data['reason']) : null,
                fullDay:  $fullDay,
            );
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (!$fullDay) {
            $openTime  = trim((string) ($data['open_time']  ?? ''));
            $closeTime = trim((string) ($data['close_time'] ?? ''));
            if ($openTime !== '' && $closeTime !== '') {
                $sc->setCustomHours($openTime, $closeTime);
            }
        }

        $this->scRepo->save($sc);

        return $this->json($this->serializeClosing($sc), Response::HTTP_CREATED);
    }

    /**
     * DELETE /api/v1/admin/venues/{venueId}/special-closings/{closingId}
     */
    #[Route('/special-closings/{closingId}', name: 'admin_special_closings_delete', methods: ['DELETE'])]
    public function deleteClosing(string $venueId, string $closingId, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->resolveVenue($venueId, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $sc = $this->scRepo->findById(Uuid::fromString($closingId));
        if ($sc === null || $sc->getVenue()->getId()->toRfc4122() !== $venue->getId()->toRfc4122()) {
            return $this->json(['error' => 'Eintrag nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->scRepo->delete($sc);

        return $this->json(['ok' => true]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function resolveVenue(string $venueId, User $user): ?Venue
    {
        $tenant = $user->getTenant();
        if ($tenant === null) return null;

        $venue = $this->em->getRepository(Venue::class)->find($venueId);
        if ($venue === null || $venue->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return null;
        }

        return $venue;
    }

    private function serializeHours(OpeningHours $oh): array
    {
        return [
            'weekday'    => $oh->getWeekday(),
            'open'       => $oh->isOpen(),
            'open_time'  => $oh->getOpenTime(),
            'close_time' => $oh->getCloseTime(),
            'breaks'     => $oh->getBreaks() ?? [],
        ];
    }

    private function serializeClosing(SpecialClosing $sc): array
    {
        return [
            'id'         => $sc->getId()->toRfc4122(),
            'date_from'  => $sc->getDateFrom()->format('Y-m-d'),
            'date_to'    => $sc->getDateTo()->format('Y-m-d'),
            'reason'     => $sc->getReason(),
            'full_day'   => $sc->isFullDay(),
            'open_time'  => $sc->getOpenTime(),
            'close_time' => $sc->getCloseTime(),
        ];
    }
}