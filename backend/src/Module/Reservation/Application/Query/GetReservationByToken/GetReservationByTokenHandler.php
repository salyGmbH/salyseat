<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\GetReservationByToken;

use App\Module\Reservation\Application\Dto\ReservationDto;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;

final class GetReservationByTokenHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
    ) {}

    public function __invoke(GetReservationByTokenQuery $query): ReservationDto
    {
        $reservation = $this->reservations->findByToken($query->token)
            ?? throw new \DomainException('Reservierung nicht gefunden.');

        return ReservationDto::fromEntity($reservation);
    }
}
