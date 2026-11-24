<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Availability\Domain\Entity\VenueBlock;
use App\Module\Availability\Infrastructure\Persistence\DoctrineVenueBlockRepository;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

#[Route('/venues/{venueId}/blocks')]
class VenueBlockController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DoctrineVenueBlockRepository $blockRepo,
        private readonly Connection $dbal,
    ) {}

    /**
     * GET /api/v1/admin/venues/{venueId}/blocks
     * Gibt alle Sperrzeiten eines Raums zurück.
     */
    #[Route('', name: 'admin_venue_blocks_list', methods: ['GET'])]
    public function list(string $venueId): JsonResponse
    {
        $venue = $this->resolveVenue($venueId);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json(array_map($this->serialize(...), $this->blockRepo->findByVenue($venue)));
    }

    /**
     * POST /api/v1/admin/venues/{venueId}/blocks
     * Legt eine neue Sperrzeit an.
     */
    #[Route('', name: 'admin_venue_blocks_create', methods: ['POST'])]
    public function create(string $venueId, Request $request): JsonResponse
    {
        $venue = $this->resolveVenue($venueId);
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
            $block = new VenueBlock(
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
            $timeFrom = trim((string) ($data['time_from'] ?? ''));
            $timeTo   = trim((string) ($data['time_to']   ?? ''));
            if ($timeFrom !== '' && $timeTo !== '') {
                $block->setTimeRange($timeFrom, $timeTo);
            }
        }

        $this->blockRepo->save($block);

        $affected = $this->findAffectedReservations(
            $venue->getId()->toRfc4122(),
            $dateFrom,
            $dateTo,
            $fullDay,
            $block->getTimeFrom(),
            $block->getTimeTo(),
        );

        return $this->json(
            $this->serialize($block) + [
                'affected_reservations_count' => \count($affected),
                'affected_reservations'       => $affected,
            ],
            Response::HTTP_CREATED,
        );
    }

    /**
     * Findet bereits bestehende, noch relevante Reservierungen (weder storniert
     * noch No-Show), die in das Fenster einer neuen Raumsperre fallen. Bei
     * Sperren ohne Ganztag gilt das Zeitfenster für JEDEN Tag im Datumsbereich
     * (analog zu VenueBlock::affectsDate()), daher der Zeit-Abgleich unabhängig
     * vom konkreten Datum. Die Sperre storniert nichts automatisch — die Liste
     * dient nur als Hinweis für die Verwaltung.
     *
     * @return array<int, array<string, mixed>>
     */
    private function findAffectedReservations(
        string $venueId,
        \DateTimeImmutable $dateFrom,
        \DateTimeImmutable $dateTo,
        bool $fullDay,
        ?string $timeFrom,
        ?string $timeTo,
    ): array {
        $rows = $this->dbal->fetchAllAssociative(
            'SELECT BIN_TO_UUID(id) AS id, guest_name AS guestName, guest_first_name AS guestFirstName,
                    party_size AS partySize, starts_at AS startsAt, ends_at AS endsAt,
                    table_number AS tableNumber
               FROM reservations
              WHERE venue_id     = UNHEX(REPLACE(:venueId, \'-\', \'\'))
                AND status       NOT IN (\'cancelled\', \'no_show\')
                AND DATE(starts_at) <= :dateTo
                AND DATE(ends_at)   >= :dateFrom
                AND (:fullDay = 1 OR (TIME(starts_at) < :timeTo AND TIME(ends_at) > :timeFrom))
              ORDER BY starts_at ASC
              LIMIT 50',
            [
                'venueId'   => $venueId,
                'dateFrom'  => $dateFrom->format('Y-m-d'),
                'dateTo'    => $dateTo->format('Y-m-d'),
                'fullDay'   => $fullDay ? 1 : 0,
                'timeFrom'  => $timeFrom ?? '00:00',
                'timeTo'    => $timeTo   ?? '23:59',
            ],
        );

        return array_map(static fn (array $r) => [
            'id'               => $r['id'],
            'guest_name'       => $r['guestName'],
            'guest_first_name' => $r['guestFirstName'],
            'party_size'       => (int) $r['partySize'],
            'starts_at'        => (new \DateTimeImmutable($r['startsAt']))->format(\DateTimeInterface::ATOM),
            'table_number'     => $r['tableNumber'] !== null ? (int) $r['tableNumber'] : null,
        ], $rows);
    }

    /**
     * DELETE /api/v1/admin/venues/{venueId}/blocks/{blockId}
     * Löscht eine Sperrzeit.
     */
    #[Route('/{blockId}', name: 'admin_venue_blocks_delete', methods: ['DELETE'])]
    public function delete(string $venueId, string $blockId): JsonResponse
    {
        $venue = $this->resolveVenue($venueId);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        try {
            $block = $this->blockRepo->findById(Uuid::fromString($blockId));
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültige ID.'], Response::HTTP_BAD_REQUEST);
        }

        if ($block === null || $block->getVenue()->getId()->toRfc4122() !== $venue->getId()->toRfc4122()) {
            return $this->json(['error' => 'Sperrzeit nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->blockRepo->delete($block);

        return $this->json(['ok' => true]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function resolveVenue(string $venueId): ?Venue
    {
        return $this->em->getRepository(Venue::class)->find($venueId);
    }

    private function serialize(VenueBlock $block): array
    {
        return [
            'id'        => $block->getId()->toRfc4122(),
            'date_from' => $block->getDateFrom()->format('Y-m-d'),
            'date_to'   => $block->getDateTo()->format('Y-m-d'),
            'reason'    => $block->getReason(),
            'full_day'  => $block->isFullDay(),
            'time_from' => $block->getTimeFrom(),
            'time_to'   => $block->getTimeTo(),
        ];
    }
}
