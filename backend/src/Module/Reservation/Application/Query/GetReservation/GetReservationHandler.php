<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\GetReservation;

use App\Module\Reservation\Application\Dto\ReservationDto;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Symfony\Component\Uid\Uuid;

final class GetReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
    ) {}

    public function __invoke(GetReservationQuery $query): ReservationDto
    {
        $reservation = $this->reservations->findById(Uuid::fromString($query->reservationId))
            ?? throw new \DomainException('Reservierung nicht gefunden.');

        // Gleiche Schutzlogik wie in den Command-Handlern:
        // 404-Antwort statt 403, damit UUID-Enumeration keinen Info-Leak ergibt
        if ($reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $query->tenantId) {
            throw new \DomainException('Reservierung nicht gefunden.');
        }

        return ReservationDto::fromEntity($reservation);
    }
}