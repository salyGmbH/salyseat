<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Availability\Domain\Entity\TableBlock;
use App\Module\Availability\Infrastructure\Persistence\DoctrineTableBlockRepository;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

#[Route('/venues/{venueId}/table-blocks')]
class TableBlockController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DoctrineTableBlockRepository $blockRepo,
    ) {}

    /**
     * GET /api/v1/admin/venues/{venueId}/table-blocks
     */
    #[Route('', name: 'admin_table_blocks_list', methods: ['GET'])]
    public function list(string $venueId): JsonResponse
    {
        $venue = $this->resolveVenue($venueId);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json(array_map($this->serialize(...), $this->blockRepo->findByVenue($venue)));
    }

    /**
     * POST /api/v1/admin/venues/{venueId}/table-blocks
     */
    #[Route('', name: 'admin_table_blocks_create', methods: ['POST'])]
    public function create(string $venueId, Request $request): JsonResponse
    {
        $venue = $this->resolveVenue($venueId);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        $tableNumber = isset($data['table_id']) ? (int) $data['table_id'] : null;
        if ($tableNumber === null || $tableNumber <= 0) {
            return $this->json(['error' => 'Ungültige table_id.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $dateFrom = new \DateTimeImmutable((string) ($data['date_from'] ?? ''));
            $dateTo   = new \DateTimeImmutable((string) ($data['date_to']   ?? ''));
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $fullDay = (bool) ($data['full_day'] ?? true);

        try {
            $block = new TableBlock(
                venue:       $venue,
                tableNumber: $tableNumber,
                dateFrom:    $dateFrom,
                dateTo:      $dateTo,
                reason:      ($data['reason'] ?? '') !== '' ? trim((string) $data['reason']) : null,
                fullDay:     $fullDay,
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

        return $this->json($this->serialize($block), Response::HTTP_CREATED);
    }

    /**
     * DELETE /api/v1/admin/venues/{venueId}/table-blocks/{blockId}
     */
    #[Route('/{blockId}', name: 'admin_table_blocks_delete', methods: ['DELETE'])]
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

    private function resolveVenue(string $venueId): ?Venue
    {
        return $this->em->getRepository(Venue::class)->find($venueId);
    }

    private function serialize(TableBlock $block): array
    {
        return [
            'id'        => $block->getId()->toRfc4122(),
            'room_id'   => $block->getVenue()->getId()->toRfc4122(),
            'table_id'  => $block->getTableNumber(),
            'date_from' => $block->getDateFrom()->format('Y-m-d'),
            'date_to'   => $block->getDateTo()->format('Y-m-d'),
            'reason'    => $block->getReason(),
            'full_day'  => $block->isFullDay(),
            'time_from' => $block->getTimeFrom(),
            'time_to'   => $block->getTimeTo(),
        ];
    }
}