<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\Service;

use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationCommand;
use App\Module\Venue\Domain\Entity\Venue;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversation;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversationState;
use App\Module\WhatsApp\Domain\Gateway\ReservationCreatorInterface;

/**
 * Treibt den geführten v1-Buchungsdialog voran (Personenzahl → Datum →
 * Uhrzeit → Name → Bestätigung). Ruft am Ende ausschließlich den
 * bestehenden, unveränderten CreateReservationHandler auf — hier wird
 * keinerlei eigene Buchungslogik nachgebaut.
 */
final class ConversationStateMachine
{
    private const MAX_RETRIES = 3;

    public function __construct(
        private readonly SlotFinder $slotFinder,
        private readonly ReplyTextParser $parser,
        private readonly ReservationCreatorInterface $reservationCreator,
    ) {}

    public function handle(WhatsappConversation $conversation, string $text, Venue $venue): string
    {
        return match ($conversation->getState()) {
            WhatsappConversationState::AWAITING_PARTY_SIZE   => $this->handlePartySize($conversation, $text),
            WhatsappConversationState::AWAITING_DATE         => $this->handleDate($conversation, $text, $venue),
            WhatsappConversationState::AWAITING_TIME         => $this->handleTime($conversation, $text),
            WhatsappConversationState::AWAITING_NAME         => $this->handleName($conversation, $text),
            WhatsappConversationState::AWAITING_CONFIRMATION => $this->handleConfirmation($conversation, $text, $venue),
            default => 'Diese Unterhaltung ist bereits abgeschlossen. Schreib uns gerne erneut, wenn du einen Tisch reservieren möchtest.',
        };
    }

    private function handlePartySize(WhatsappConversation $c, string $text): string
    {
        $size = $this->parser->parsePartySize($text);
        if ($size === null) {
            return $this->retryOrAbandon($c, 'Für wie viele Personen möchtest du reservieren? (z. B. "4")');
        }

        $c->setDraftPartySize($size);
        $c->setState(WhatsappConversationState::AWAITING_DATE);

        return "Super, für {$size} Personen. An welchem Tag möchtest du reservieren? (z. B. \"heute\", \"morgen\" oder \"24.12.\")";
    }

    private function handleDate(WhatsappConversation $c, string $text, Venue $venue): string
    {
        $now  = new \DateTimeImmutable('today');
        $date = $this->parser->parseDate($text, $now);

        if ($date === null || $date < $now) {
            return $this->retryOrAbandon($c, 'Das habe ich leider nicht verstanden. An welchem Tag möchtest du reservieren? (z. B. "heute", "morgen" oder "24.12.")');
        }

        $dateStr = $date->format('Y-m-d');
        $slots   = $this->slotFinder->findAvailableTimeSlots($venue, $dateStr, $c->getDraftPartySize() ?? 1);

        if (empty($slots)) {
            // Bleibt bewusst in AWAITING_DATE — kein Retry-Zähler, da eine
            // korrekt verstandene, aber ausgebuchte Anfrage kein Fehler ist.
            return "Für den {$date->format('d.m.Y')} ist leider kein Tisch für {$c->getDraftPartySize()} Personen frei. Möchtest du einen anderen Tag versuchen?";
        }

        $c->setDraftDate($date);
        $c->setOfferedSlots($slots);
        $c->setState(WhatsappConversationState::AWAITING_TIME);

        $numbered = [];
        foreach ($slots as $i => $slot) {
            $numbered[] = ($i + 1) . ') ' . $slot;
        }

        return "Diese Uhrzeiten sind am {$date->format('d.m.Y')} frei:\n" . implode("\n", $numbered)
            . "\n\nSchreib mir einfach die Nummer oder die Uhrzeit.";
    }

    private function handleTime(WhatsappConversation $c, string $text): string
    {
        $offered = $c->getOfferedSlots() ?? [];
        $time    = $this->parser->parseTimeSelection($text, $offered);

        if ($time === null) {
            return $this->retryOrAbandon($c, 'Bitte wähl eine der angebotenen Uhrzeiten per Nummer aus.');
        }

        $c->setDraftTime($time);
        $c->setState(WhatsappConversationState::AWAITING_NAME);

        return 'Auf welchen Namen darf ich reservieren?';
    }

    private function handleName(WhatsappConversation $c, string $text): string
    {
        $name = trim($text);
        if ($name === '' || mb_strlen($name) > 255) {
            return $this->retryOrAbandon($c, 'Wie ist dein Name?');
        }

        $c->setDraftName($name);
        $c->setState(WhatsappConversationState::AWAITING_CONFIRMATION);

        $dateLabel = $c->getDraftDate()?->format('d.m.Y') ?? '';

        return "Kurz zusammengefasst:\n"
            . "{$c->getDraftPartySize()} Personen\n"
            . "{$dateLabel} um {$c->getDraftTime()} Uhr\n"
            . "Auf den Namen {$name}\n\n"
            . 'Passt das so? (ja/nein)';
    }

    private function handleConfirmation(WhatsappConversation $c, string $text, Venue $venue): string
    {
        $answer = $this->parser->parseYesNo($text);

        if ($answer === null) {
            return 'Bitte antworte mit "ja" oder "nein".';
        }

        if ($answer === false) {
            $c->setState(WhatsappConversationState::CANCELLED);
            return 'Kein Problem, die Reservierung wurde nicht angelegt. Schreib uns gerne erneut, wenn du doch noch reservieren möchtest.';
        }

        $draftDate = $c->getDraftDate();
        $draftTime = $c->getDraftTime();
        if ($draftDate === null || $draftTime === null || $c->getDraftPartySize() === null) {
            $c->setState(WhatsappConversationState::ABANDONED);
            return 'Da ist leider etwas schiefgelaufen. Bitte schreib uns erneut, um zu reservieren.';
        }

        $startsAt = new \DateTimeImmutable($draftDate->format('Y-m-d') . ' ' . $draftTime . ':00');

        try {
            $reservation = $this->reservationCreator->createReservation(new CreateReservationCommand(
                venueId:    $venue->getId()->toRfc4122(),
                guestName:  $c->getDraftName() ?? 'WhatsApp-Gast',
                guestEmail: $this->syntheticGuestEmail($c->getGuestPhone(), $venue),
                partySize:  $c->getDraftPartySize(),
                startsAt:   $startsAt,
                guestPhone: $c->getGuestPhone(),
                source:     'whatsapp',
            ));
        } catch (\DomainException $e) {
            $c->setState(WhatsappConversationState::AWAITING_TIME);
            return 'Leider hat es nicht geklappt: ' . $e->getMessage() . ' Möchtest du eine andere Uhrzeit versuchen?';
        }

        $c->setState(WhatsappConversationState::COMPLETED);
        $c->setReservationId($reservation->getId());

        return "Deine Reservierung ist bestätigt! {$c->getDraftPartySize()} Personen am {$draftDate->format('d.m.Y')} um {$draftTime} Uhr. Wir freuen uns auf dich!";
    }

    /**
     * Synthetische Platzhalter-E-Mail, da CreateReservationCommand::$guestEmail
     * ein Pflichtfeld ist, der WhatsApp-Flow aber bewusst keine E-Mail abfragt
     * (siehe Plan, Abschnitt "Bekannter Trade-off: Gast-E-Mail"). Deterministisch
     * aus der Telefonnummer, damit derselbe Gast bei erneuter Buchung per
     * WhatsApp wieder demselben Guest-Datensatz zugeordnet wird.
     */
    private function syntheticGuestEmail(string $phone, Venue $venue): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? $phone;
        return "whatsapp-{$digits}@guests.{$venue->getTenant()->getSlug()}.invalid";
    }

    private function retryOrAbandon(WhatsappConversation $c, string $reprompt): string
    {
        $c->incrementRetryCount();
        if ($c->getRetryCount() >= self::MAX_RETRIES) {
            $c->setState(WhatsappConversationState::ABANDONED);
            return 'Das hat leider nicht geklappt. Bitte ruf uns direkt an, wenn du reservieren möchtest.';
        }
        return $reprompt;
    }
}