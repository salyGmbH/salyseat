<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\ListReservations;

use App\Module\Reservation\Application\Dto\ReservationDto;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Symfony\Component\Uid\Uuid;

final class ListReservationsHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
    ) {}

    public function __invoke(ListReservationsQuery $query): array
    {
        $tenantId = Uuid::fromString($query->tenantId);
        $date     = $query->date !== null ? new \DateTimeImmutable($query->date) : null;

        $items = $this->reservations->findByTenant(
            $tenantId,
            $query->status,
            $date,
            $query->limit,
            $query->offset,
        );

        $total = $this->reservations->countByTenant($tenantId, $query->status, $date);

        return [
            'reservations' => array_map(
                static fn(Reservation $r) => ReservationDto::fromEntity($r)->toArray(),
                $items,
            ),
            'total'  => $total,
            'limit'  => $query->limit,
            'offset' => $query->offset,
        ];
    }
}
