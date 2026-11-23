<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\MarkNoShow;

use App\Messenger\Message\SendNoShowEmail;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Uid\Uuid;

final class MarkNoShowHandler
{
    public function __construct(
        private readonly ReservationRepositoryInterface $reservations,
        private readonly EntityManagerInterface         $em,
        private readonly MessageBusInterface            $bus,
        private readonly LoggerInterface                $logger,
    ) {}

    public function __invoke(MarkNoShowCommand $cmd): Reservation
    {
        $reservation = $this->findForTenant($cmd->reservationId, $cmd->tenantId);

        if ($reservation->isCancelled()) {
            throw new \DomainException('Eine stornierte Reservierung kann nicht als No-Show markiert werden.');
        }

        $reservation->markAsNoShow();

        if ($cmd->performedByEmployeeNumber !== null && $cmd->performedByName !== null) {
            $reservation->recordStaffAction($cmd->performedByEmployeeNumber, $cmd->performedByName, 'no_show');
        }

        $this->logger->info('Reservierung als No-Show markiert', [
            'reservation_id' => $cmd->reservationId,
            'email'          => $reservation->getGuestEmail(),
            'venue'          => $reservation->getVenue()->getName(),
            'starts_at'      => $reservation->getStartsAt()->format(\DateTimeInterface::ATOM),
        ]);

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
                $this->logger->warning('Gast automatisch gesperrt nach No-Show-Schwellenwert', [
                    'guest_email'   => $guest->getEmail(),
                    'no_show_count' => $count,
                    'threshold'     => $threshold,
                ]);
            }

            // Auto-Tag: ab 3 No-Shows gilt der Gast als unzuverlässig
            if ($guest->getNoShowCount() >= 3) {
                $hinweise = $guest->getHinweise();
                if (!in_array('unzuverlaessig', $hinweise, true)) {
                    $guest->setHinweise([...$hinweise, 'unzuverlaessig']);
                }
            }

            $this->em->persist($guest);

            // No-Show-Mail nur versenden wenn der Gast eine E-Mail-Adresse hat
            if ($guest->getEmail() !== '') {
                $uiSettings  = $reservation->getVenue()->getTenant()->getUiSettings() ?? [];
                $mailEnabled = true;
                foreach (($uiSettings['emailSettings']['mailSettings'] ?? []) as $ms) {
                    if (($ms['key'] ?? '') === 'no_show') {
                        $mailEnabled = (bool) ($ms['enabled'] ?? true);
                        break;
                    }
                }

                if ($mailEnabled) {
                    $this->bus->dispatch(new SendNoShowEmail(
                        reservationId: $reservation->getId()->toRfc4122(),
                        guestEmail:    $guest->getEmail(),
                        guestName:     $guest->getName(),
                        startsAt:      $reservation->getStartsAt()->format('d.m.Y H:i'),
                        venueName:     $reservation->getVenue()->getName(),
                        tenantId:      $reservation->getVenue()->getTenant()->getId()->toRfc4122(),
                        guestFirstName: $reservation->getGuestFirstName(),
                        occasion:       $reservation->getOccasion(),
                    ));
                }
            }
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
