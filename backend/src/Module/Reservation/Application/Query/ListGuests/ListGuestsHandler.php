<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\ListGuests;

use App\Module\Reservation\Domain\Repository\GuestRepositoryInterface;
use Symfony\Component\Uid\Uuid;

final class ListGuestsHandler
{
    public function __construct(
        private readonly GuestRepositoryInterface $guests,
    ) {}

    public function __invoke(ListGuestsQuery $query): array
    {
        $tenantId = Uuid::fromString($query->tenantId);

        $items = $this->guests->listByTenant($tenantId, $query->search, $query->limit, $query->offset);
        $total = $this->guests->countByTenant($tenantId, $query->search);

        return [
            'guests' => array_map(fn ($g) => [
                'id'                 => $g->getId()->toRfc4122(),
                'name'               => $g->getName(),
                'email'              => $g->getEmail(),
                'phone'              => $g->getPhone(),
                'total_reservations' => $g->getTotalReservations(),
                'no_show_count'      => $g->getNoShowCount(),
                'reliability_score'  => $g->getReliabilityScore(),
                'blocked'            => $g->isBlocked(),
                'blocked_reason'     => $g->getBlockedReason(),
                'internal_notes'     => $g->getInternalNotes(),
                'gasttypen'          => $g->getGasttypen(),
                'hinweise'           => $g->getHinweise(),
                'created_at'         => $g->getCreatedAt()->format('Y-m-d'),
            ], $items),
            'total'  => $total,
            'limit'  => $query->limit,
            'offset' => $query->offset,
        ];
    }
}
