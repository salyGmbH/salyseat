<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\UpdateReservation;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Symfony\Component\Uid\Uuid;

final class UpdateReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
    ) {}

    public function __invoke(UpdateReservationCommand $cmd): Reservation
    {
        $reservation = $this->reservations->findById(Uuid::fromString($cmd->reservationId))
            ?? throw new \DomainException('Reservierung nicht gefunden.');

        if ($reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $cmd->tenantId) {
            throw new \DomainException('Reservierung nicht gefunden.');
        }

        $endsAt = null;
        if ($cmd->startsAt !== null) {
            $minutes = $cmd->durationMinutes ?? $reservation->getVenue()->getDefaultDurationMinutes();
            $endsAt  = $cmd->startsAt->modify(sprintf('+%d minutes', $minutes));
        }

        $reservation->updateDetails(
            guestName:  $cmd->guestName,
            partySize:  $cmd->partySize,
            startsAt:   $cmd->startsAt,
            endsAt:     $endsAt,
            guestPhone: $cmd->guestPhone,
            guestNotes: $cmd->guestNotes,
        );

        $this->reservations->save($reservation);

        return $reservation;
    }
}
