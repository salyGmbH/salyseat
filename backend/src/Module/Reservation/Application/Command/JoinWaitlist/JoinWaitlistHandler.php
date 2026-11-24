<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\JoinWaitlist;

use App\Messenger\Message\SendWaitlistNotification;
use App\Module\Reservation\Domain\Entity\WaitlistEntry;
use App\Module\Reservation\Domain\Repository\WaitlistEntryRepositoryInterface;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\MessageBusInterface;

final class JoinWaitlistHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly WaitlistEntryRepositoryInterface $waitlist,
        private readonly MessageBusInterface $bus,
        private readonly Connection $dbal,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(JoinWaitlistCommand $cmd): WaitlistEntry
    {
        $venue = $this->em->getRepository(Venue::class)->find($cmd->venueId)
            ?? throw new \DomainException('Venue nicht gefunden.');

        if (!$venue->isActive()) {
            throw new \DomainException('Dieses Venue nimmt aktuell keine Buchungen an.');
        }

        // Raumsperrung prüfen — ein gesperrter Slot wird nie frei, daher macht
        // ein Warteliste-Eintrag dafür keinen Sinn. Gleiche Prüfung wie in
        // CreateReservationHandler::__invoke() (dort gegen [startsAt, endsAt),
        // hier reicht der exakte Warteliste-Zeitpunkt als Ganztages-Slot).
        $dateStr    = $cmd->requestedAt->format('Y-m-d');
        $timeStr    = $cmd->requestedAt->format('H:i');
        $venueBlock = $this->dbal->fetchOne(
            'SELECT id FROM venue_blocks
              WHERE venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND date_from <= ? AND date_to >= ?
                AND (full_day = 1 OR (time_from < ? AND time_to > ?))
              LIMIT 1',
            [$venue->getId()->toRfc4122(), $dateStr, $dateStr, $timeStr, $timeStr],
        );
        if ($venueBlock !== false) {
            throw new \DomainException('Dieser Raum ist für das gewählte Datum gesperrt.');
        }

        $tenant     = $venue->getTenant();
        $uiSettings = $tenant->getUiSettings() ?? [];
        $functional = $uiSettings['widgetFunctional'] ?? [];

        if (!($functional['wartelisteAktiv'] ?? false)) {
            throw new \DomainException('Die Warteliste ist für dieses Restaurant nicht aktiviert.');
        }

        $kanal = $functional['wartelisteKanal'] ?? 'email';
        if (\in_array($kanal, ['telefon', 'beide'], true) && trim((string) ($cmd->guestPhone ?? '')) === '') {
            throw new \DomainException('Bitte gib eine Telefonnummer an, damit wir dich kontaktieren können.');
        }

        $maxPlaetze = (int) ($functional['wartelisteMaxPlaetze'] ?? 0);
        if ($maxPlaetze > 0) {
            $current = $this->waitlist->sumPartySizeForSlot($venue->getId(), $cmd->requestedAt);
            if ($current + $cmd->partySize > $maxPlaetze) {
                throw new \DomainException('Die Warteliste für diesen Zeitpunkt ist bereits voll.');
            }
        }

        $entry = new WaitlistEntry(
            tenant:         $tenant,
            venue:          $venue,
            requestedAt:    $cmd->requestedAt,
            partySize:      $cmd->partySize,
            guestName:      $cmd->guestName,
            guestEmail:     $cmd->guestEmail,
            guestPhone:     $cmd->guestPhone,
            notes:          $cmd->notes,
            guestFirstName: $cmd->guestFirstName,
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
                guestFirstName:  $cmd->guestFirstName,
            ));
        } else {
            $this->logger->warning('Keine Kontakt-E-Mail für Warteliste-Benachrichtigung hinterlegt', [
                'venue_id' => $cmd->venueId,
            ]);
        }

        return $entry;
    }
}
