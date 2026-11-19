<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\JoinWaitlist;

use App\Messenger\Message\SendWaitlistNotification;
use App\Module\Reservation\Domain\Entity\WaitlistEntry;
use App\Module\Reservation\Domain\Repository\WaitlistEntryRepositoryInterface;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\MessageBusInterface;

final class JoinWaitlistHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly WaitlistEntryRepositoryInterface $waitlist,
        private readonly MessageBusInterface $bus,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(JoinWaitlistCommand $cmd): WaitlistEntry
    {
        $venue = $this->em->getRepository(Venue::class)->find($cmd->venueId)
            ?? throw new \DomainException('Venue nicht gefunden.');

        if (!$venue->isActive()) {
            throw new \DomainException('Dieses Venue nimmt aktuell keine Buchungen an.');
        }

        $tenant     = $venue->getTenant();
        $uiSettings = $tenant->getUiSettings() ?? [];
        $functional = $uiSettings['widgetFunctional'] ?? [];

        if (!($functional['wartelisteAktiv'] ?? false)) {
            throw new \DomainException('Die Warteliste ist für dieses Restaurant nicht aktiviert.');
        }

        $maxPlaetze = (int) ($functional['wartelisteMaxPlaetze'] ?? 0);
        if ($maxPlaetze > 0) {
            $current = $this->waitlist->sumPartySizeForSlot($venue->getId(), $cmd->requestedAt);
            if ($current + $cmd->partySize > $maxPlaetze) {
                throw new \DomainException('Die Warteliste für diesen Zeitpunkt ist bereits voll.');
            }
        }

        $entry = new WaitlistEntry(
            tenant:      $tenant,
            venue:       $venue,
            requestedAt: $cmd->requestedAt,
            partySize:   $cmd->partySize,
            guestName:   $cmd->guestName,
            guestEmail:  $cmd->guestEmail,
            guestPhone:  $cmd->guestPhone,
            notes:       $cmd->notes,
        );

        $this->em->persist($entry);
        $this->em->flush();

        $this->logger->info('Warteliste-Eintrag erstellt', [
            'waitlist_entry_id' => $entry->getId()->toRfc4122(),
            'venue_id'          => $cmd->venueId,
            'requested_at'      => $cmd->requestedAt->format(\DateTimeInterface::ATOM),
            'party_size'        => $cmd->partySize,
        ]);

        $notifyEmail = $tenant->getContactEmail() ?: $venue->getEmail();

        if ($notifyEmail !== null && $notifyEmail !== '') {
            $this->bus->dispatch(new SendWaitlistNotification(
                waitlistEntryId: $entry->getId()->toRfc4122(),
                venueName:       $venue->getName(),
                notifyEmail:     $notifyEmail,
                guestName:       $cmd->guestName,
                guestEmail:      $cmd->guestEmail,
                guestPhone:      $cmd->guestPhone,
                partySize:       $cmd->partySize,
                requestedAt:     $cmd->requestedAt->format('d.m.Y H:i'),
                answerHours:     (int) ($functional['wartelisteAntwortStunden'] ?? 24),
            ));
        } else {
            $this->logger->warning('Keine Kontakt-E-Mail für Warteliste-Benachrichtigung hinterlegt', [
                'venue_id' => $cmd->venueId,
            ]);
        }

        return $entry;
    }
}