<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\MarkNoShow;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

final class MarkNoShowHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(MarkNoShowCommand $cmd): Reservation
    {
        $reservation = $this->findForTenant($cmd->reservationId, $cmd->tenantId);

        if ($reservation->isCancelled()) {
            throw new \DomainException('Eine stornierte Reservierung kann nicht als No-Show markiert werden.');
        }

        $reservation->markAsNoShow();

        // Gast-Counter ebenfalls hochzählen — beide Änderungen atomar flushen
        $guest = $reservation->getGuest();
        if ($guest !== null) {
            $guest->incrementNoShows();
            $this->em->persist($guest);
        }

        $this->em->persist($reservation);
        $this->em->flush();

        return $reservation;
    }

    private function findForTenant(string $reservationId, string $tenantId): Reservation
    {
        $reservation = $this->reservations->findById(Uuid::fromString($reservationId))
            ?? throw new \DomainException('Reservierung nicht gefunden.');

        if ($reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $tenantId) {
            throw new \DomainException('Reservierung nicht gefunden.');
        }

        return $reservation;
    }
}
