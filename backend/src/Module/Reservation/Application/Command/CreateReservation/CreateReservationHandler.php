<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\CreateReservation;

use App\Messenger\Message\SendConfirmationEmail;
use App\Module\Reservation\Domain\Entity\Guest;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\GuestRepositoryInterface;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Messenger\MessageBusInterface;

final class CreateReservationHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GuestRepositoryInterface $guests,
        private readonly MessageBusInterface $bus,
    ) {}

    public function __invoke(CreateReservationCommand $cmd): Reservation
    {
        $venue = $this->em->getRepository(Venue::class)->find($cmd->venueId)
            ?? throw new \DomainException('Venue nicht gefunden.');

        if (!$venue->isActive()) {
            throw new \DomainException('Dieses Venue nimmt aktuell keine Buchungen an.');
        }

        $tenant = $venue->getTenant();

        $guest = $this->guests->findByTenantAndEmail($tenant->getId(), $cmd->guestEmail);

        if ($guest === null) {
            $guest = new Guest($tenant, $cmd->guestName, $cmd->guestEmail);
            if ($cmd->guestPhone !== null) {
                $guest->setPhone($cmd->guestPhone);
            }
        }

        if ($guest->isBlocked()) {
            throw new \DomainException('Diese E-Mail-Adresse kann aktuell keine Reservierungen vornehmen.');
        }

        $endsAt = $cmd->startsAt->modify(sprintf('+%d minutes', $venue->getDefaultDurationMinutes()));

        $reservation = new Reservation(
            $venue,
            $cmd->guestName,
            $cmd->guestEmail,
            $cmd->partySize,
            $cmd->startsAt,
            $endsAt,
            $cmd->guestPhone,
            $cmd->guestNotes,
        );
        $reservation->setGuest($guest);
        $guest->incrementReservations();

        // Beide Entities in einem einzigen flush persistieren — atomar.
        // Würden wir zweimal save() aufrufen, hätten wir zwei Transaktionen:
        // Wenn die zweite schlägt, wäre der Gäste-Counter bereits hochgezählt.
        $this->em->persist($guest);
        $this->em->persist($reservation);
        $this->em->flush();

        $this->bus->dispatch(new SendConfirmationEmail(
            reservationId:    $reservation->getId()->toRfc4122(),
            guestEmail:       $cmd->guestEmail,
            guestName:        $cmd->guestName,
            reservationToken: $reservation->getToken(),
            startsAt:         $reservation->getStartsAt()->format(\DateTimeInterface::ATOM),
            partySize:        $cmd->partySize,
            venueName:        $venue->getName(),
        ));

        return $reservation;
    }
}
