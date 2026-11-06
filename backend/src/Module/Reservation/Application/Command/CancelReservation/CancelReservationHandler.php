<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\CancelReservation;

use App\Messenger\Message\SendCancellationEmail;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Symfony\Component\Messenger\MessageBusInterface;

final class CancelReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
        private readonly MessageBusInterface $bus,
    ) {}

    public function __invoke(CancelReservationCommand $cmd): Reservation
    {
        $reservation = $this->reservations->findByToken($cmd->token)
            ?? throw new \DomainException('Reservierung nicht gefunden.');

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
