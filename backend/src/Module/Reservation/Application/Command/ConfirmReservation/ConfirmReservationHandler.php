<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\ConfirmReservation;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Symfony\Component\Uid\Uuid;

final class ConfirmReservationHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
    ) {}

    public function __invoke(ConfirmReservationCommand $cmd): Reservation
    {
        $reservation = $this->findForTenant($cmd->reservationId, $cmd->tenantId);

        if ($reservation->isCancelled()) {
            throw new \DomainException('Eine stornierte Reservierung kann nicht bestätigt werden.');
        }

        $reservation->confirm();
        $this->reservations->save($reservation);

        return $reservation;
    }

    private function findForTenant(string $reservationId, string $tenantId): Reservation
    {
        $reservation = $this->reservations->findById(Uuid::fromString($reservationId))
            ?? throw new \DomainException('Reservierung nicht gefunden.');

        // Tenant-Prüfung: verhindert, dass ein Admin die Daten eines anderen Tenants manipuliert
        if ($reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $tenantId) {
            throw new \DomainException('Reservierung nicht gefunden.');
        }

        return $reservation;
    }
}
