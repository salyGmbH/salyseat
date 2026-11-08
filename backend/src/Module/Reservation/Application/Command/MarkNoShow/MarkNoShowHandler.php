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

        // Gast-Counter hochzählen; ggf. automatisch sperren
        $guest = $reservation->getGuest();
        if ($guest !== null) {
            $guest->incrementNoShows();
            $guest->updateLastVisitAt($reservation->getStartsAt());

            $uiSettings = $reservation->getVenue()->getTenant()->getUiSettings() ?? [];
            $threshold  = isset($uiSettings['noShowAutoBlockThreshold'])
                ? (int) $uiSettings['noShowAutoBlockThreshold']
                : null;

            if ($threshold !== null && !$guest->isBlocked() && $guest->getNoShowCount() >= $threshold) {
                $count = $guest->getNoShowCount();
                $guest->block(
                    'Automatisch gesperrt nach ' . $count . ' No-Show' . ($count !== 1 ? 's' : ''),
                );
            }

            // Auto-Tag: ab 3 No-Shows gilt der Gast als unzuverlässig
            if ($guest->getNoShowCount() >= 3) {
                $hinweise = $guest->getHinweise();
                if (!in_array('unzuverlaessig', $hinweise, true)) {
                    $guest->setHinweise([...$hinweise, 'unzuverlaessig']);
                }
            }

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
