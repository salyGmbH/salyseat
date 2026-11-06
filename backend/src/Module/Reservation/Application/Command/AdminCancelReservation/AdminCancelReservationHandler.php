<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\AdminCancelReservation;

use App\Messenger\Message\SendCancellationEmail;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Uid\Uuid;

final class AdminCancelReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
        private readonly MessageBusInterface $bus,
    ) {}

    public function __invoke(AdminCancelReservationCommand $cmd): Reservation
    {
        $reservation = $this->reservations->findById(Uuid::fromString($cmd->reservationId))
            ?? throw new \DomainException('Reservierung nicht gefunden.');

        if ($reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $cmd->tenantId) {
            throw new \DomainException('Reservierung nicht gefunden.');
        }

        if ($reservation->isCancelled()) {
            throw new \DomainException('Die Reservierung wurde bereits storniert.');
        }

        $reservation->cancel();
        $this->reservations->save($reservation);

        $this->bus->dispatch(new SendCancellationEmail(
            reservationId: $reservation->getId()->toRfc4122(),
            guestEmail:    $reservation->getGuestEmail(),
            guestName:     $reservation->getGuestName(),
            startsAt:      $reservation->getStartsAt()->format(\DateTimeInterface::ATOM),
            venueName:     $reservation->getVenue()->getName(),
        ));

        return $reservation;
    }
}
