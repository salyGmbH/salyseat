<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\ReopenReservation;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Symfony\Component\Uid\Uuid;

final class ReopenReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
    ) {}

    public function __invoke(ReopenReservationCommand $cmd): Reservation
    {
        $reservation = $this->reservations->findById(Uuid::fromString($cmd->reservationId))
            ?? throw new \DomainException('Reservierung nicht gefunden.');

        if ($reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $cmd->tenantId) {
            throw new \DomainException('Reservierung nicht gefunden.');
        }

        $reservation->reopen();
        $this->reservations->save($reservation);

        return $reservation;
    }
}
