<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\AdminCancelReservation;

use App\Messenger\Message\CancelReservationInPms;
use App\Messenger\Message\SendCancellationEmail;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Uid\Uuid;

final class AdminCancelReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
        private readonly MessageBusInterface $bus,
        private readonly LoggerInterface $logger,
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

        if ($cmd->performedByEmployeeNumber !== null && $cmd->performedByName !== null) {
            $reservation->recordStaffAction($cmd->performedByEmployeeNumber, $cmd->performedByName, 'cancelled');
        }

        $this->logger->info('Reservierung storniert (Admin)', [
            'reservation_id' => $cmd->reservationId,
            'email'          => $reservation->getGuestEmail(),
            'venue'          => $reservation->getVenue()->getName(),
        ]);

        // Stornierungen beim Gast zählen
        $guest = $reservation->getGuest();
        if ($guest !== null) {
            $guest->incrementCancellations();
        }

        $this->reservations->save($reservation);

        $this->bus->dispatch(new SendCancellationEmail(
            reservationId: $reservation->getId()->toRfc4122(),
            guestEmail:    $reservation->getGuestEmail(),
            guestName:     $reservation->getGuestName(),
            startsAt:      $reservation->getStartsAt()->format('d.m.Y H:i'),
            venueName:     $reservation->getVenue()->getName(),
            tenantId:      $reservation->getVenue()->getTenant()->getId()->toRfc4122(),
            guestFirstName: $reservation->getGuestFirstName(),
            occasion:       $reservation->getOccasion(),
        ));

        if ($reservation->getMewsReservationId() !== null) {
            $this->bus->dispatch(new CancelReservationInPms(
                $reservation->getMewsReservationId(),
                $reservation->getVenue()->getTenant()->getId()->toRfc4122(),
            ));
        }

        return $reservation;
    }
}
