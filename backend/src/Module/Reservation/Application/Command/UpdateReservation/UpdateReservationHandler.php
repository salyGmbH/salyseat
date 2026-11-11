<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\UpdateReservation;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

final class UpdateReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
        private readonly EntityManagerInterface $em,
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

        if ($cmd->tableNumber !== false) {
            $reservation->setTableNumber(is_int($cmd->tableNumber) ? $cmd->tableNumber : null);
        }

        if ($cmd->venueId !== null) {
            $newVenue = $this->em->getRepository(Venue::class)->find($cmd->venueId)
                ?? throw new \DomainException('Ziel-Venue nicht gefunden.');
            if ($newVenue->getTenant()->getId()->toRfc4122() !== $cmd->tenantId) {
                throw new \DomainException('Ziel-Venue nicht gefunden.');
            }
            $reservation->moveToVenue($newVenue);
        }

        $this->reservations->save($reservation);

        return $reservation;
    }
}
