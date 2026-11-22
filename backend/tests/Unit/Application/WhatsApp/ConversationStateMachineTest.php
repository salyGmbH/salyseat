<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\WhatsApp;

use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationCommand;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Venue\Domain\Entity\Venue;
use App\Module\WhatsApp\Application\Service\ConversationStateMachine;
use App\Module\WhatsApp\Application\Service\ReplyTextParser;
use App\Module\WhatsApp\Application\Service\SlotFinder;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversation;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversationState;
use App\Module\WhatsApp\Domain\Gateway\ReservationCreatorInterface;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Uid\Uuid;

final class ConversationStateMachineTest extends TestCase
{
    private SlotFinder&MockObject $slotFinder;
    private ReservationCreatorInterface&MockObject $reservationCreator;
    private ConversationStateMachine $machine;
    private Tenant $tenant;
    private Venue $venue;
    private Venue $venue2;

    protected function setUp(): void
    {
        $this->slotFinder         = $this->createMock(SlotFinder::class);
        $this->reservationCreator = $this->createMock(ReservationCreatorInterface::class);

        $this->machine = new ConversationStateMachine(
            $this->slotFinder,
            new ReplyTextParser(),
            $this->reservationCreator,
        );

        $this->tenant = new Tenant('Test-Restaurant', 'test-restaurant');
        $this->venue  = new Venue($this->tenant, 'Hauptraum', 'restaurant');
        $this->venue2 = new Venue($this->tenant, 'Hochzeitsraum', 'restaurant');
    }

    private function newConversation(): WhatsappConversation
    {
        $c = new WhatsappConversation($this->tenant, '491511234567', 'Max Mustermann');
        $c->setVenue($this->venue);
        return $c;
    }

    public function testInvalidPartySizeRepromptsWithoutAdvancingState(): void
    {
        $c = $this->newConversation();

        $reply = $this->machine->handle($c, 'Hallo', [$this->venue]);

        self::assertSame(WhatsappConversationState::AWAITING_PARTY_SIZE, $c->getState());
        self::assertSame(1, $c->getRetryCount());
        self::assertStringContainsString('Personen', $reply);
    }

    public function testTooManyInvalidRepliesAbandonsConversation(): void
    {
        $c = $this->newConversation();

        $this->machine->handle($c, 'a', [$this->venue]);
        $this->machine->handle($c, 'b', [$this->venue]);
        $reply = $this->machine->handle($c, 'c', [$this->venue]);

        self::assertSame(WhatsappConversationState::ABANDONED, $c->getState());
        self::assertStringContainsString('ruf uns direkt an', $reply);
    }

    public function testValidPartySizeAdvancesToAwaitingDate(): void
    {
        $c = $this->newConversation();

        $reply = $this->machine->handle($c, '4', [$this->venue]);

        self::assertSame(WhatsappConversationState::AWAITING_DATE, $c->getState());
        self::assertSame(4, $c->getDraftPartySize());
        self::assertStringContainsString('welchem Tag', $reply);
    }

    public function testDateWithNoAvailableSlotsStaysInAwaitingDate(): void
    {
        $c = $this->newConversation();
        $c->setDraftPartySize(4);
        $c->setState(WhatsappConversationState::AWAITING_DATE);

        $this->slotFinder->method('findAvailableTimeSlots')->willReturn([]);

        $reply = $this->machine->handle($c, 'heute', [$this->venue]);

        self::assertSame(WhatsappConversationState::AWAITING_DATE, $c->getState());
        self::assertStringContainsString('kein Tisch', $reply);
    }

    public function testValidDateWithSlotsAdvancesToAwaitingTimeAndListsSlots(): void
    {
        $c = $this->newConversation();
        $c->setDraftPartySize(2);
        $c->setState(WhatsappConversationState::AWAITING_DATE);

        $this->slotFinder->method('findAvailableTimeSlots')->willReturn(['18:00', '18:30', '19:00']);

        $reply = $this->machine->handle($c, 'heute', [$this->venue]);

        self::assertSame(WhatsappConversationState::AWAITING_TIME, $c->getState());
        self::assertSame(['18:00', '18:30', '19:00'], $c->getOfferedSlots());
        self::assertStringContainsString('1) 18:00', $reply);
        self::assertStringContainsString('3) 19:00', $reply);
    }

    public function testTimeSelectionByNumberAdvancesToAwaitingName(): void
    {
        $c = $this->newConversation();
        $c->setDraftPartySize(2);
        $c->setDraftDate(new \DateTimeImmutable('2026-11-22'));
        $c->setOfferedSlots(['18:00', '18:30', '19:00']);
        $c->setState(WhatsappConversationState::AWAITING_TIME);

        $reply = $this->machine->handle($c, '3', [$this->venue]);

        self::assertSame(WhatsappConversationState::AWAITING_NAME, $c->getState());
        self::assertSame('19:00', $c->getDraftTime());
        self::assertStringContainsString('Namen', $reply);
    }

    public function testNameAdvancesToAwaitingConfirmationWithSummary(): void
    {
        $c = $this->newConversation();
        $c->setDraftPartySize(2);
        $c->setDraftDate(new \DateTimeImmutable('2026-11-22'));
        $c->setDraftTime('19:00');
        $c->setState(WhatsappConversationState::AWAITING_NAME);

        $reply = $this->machine->handle($c, 'Erika Musterfrau', [$this->venue]);

        self::assertSame(WhatsappConversationState::AWAITING_CONFIRMATION, $c->getState());
        self::assertSame('Erika Musterfrau', $c->getDraftName());
        self::assertStringContainsString('Erika Musterfrau', $reply);
        self::assertStringContainsString('19:00', $reply);
        self::assertStringContainsString('ja/nein', $reply);
    }

    public function testConfirmationDeclineCancelsConversationWithoutCreatingReservation(): void
    {
        $c = $this->newConversation();
        $c->setDraftPartySize(2);
        $c->setDraftDate(new \DateTimeImmutable('2026-11-22'));
        $c->setDraftTime('19:00');
        $c->setDraftName('Erika Musterfrau');
        $c->setState(WhatsappConversationState::AWAITING_CONFIRMATION);

        $this->reservationCreator->expects(self::never())->method('createReservation');

        $reply = $this->machine->handle($c, 'nein', [$this->venue]);

        self::assertSame(WhatsappConversationState::CANCELLED, $c->getState());
        self::assertStringContainsString('nicht angelegt', $reply);
    }

    public function testConfirmationYesCreatesReservationViaExistingHandlerAndCompletesConversation(): void
    {
        $c = $this->newConversation();
        $c->setDraftPartySize(2);
        $c->setDraftDate(new \DateTimeImmutable('2026-11-22'));
        $c->setDraftTime('19:00');
        $c->setDraftName('Erika Musterfrau');
        $c->setState(WhatsappConversationState::AWAITING_CONFIRMATION);

        $reservation = $this->createMock(Reservation::class);
        $reservationId = Uuid::v7();
        $reservation->method('getId')->willReturn($reservationId);

        $this->reservationCreator->expects(self::once())
            ->method('createReservation')
            ->with(self::callback(function (CreateReservationCommand $cmd) {
                self::assertSame($this->venue->getId()->toRfc4122(), $cmd->venueId);
                self::assertSame('Erika Musterfrau', $cmd->guestName);
                self::assertSame(2, $cmd->partySize);
                self::assertSame('491511234567', $cmd->guestPhone);
                self::assertSame('whatsapp', $cmd->source);
                self::assertSame('2026-11-22 19:00:00', $cmd->startsAt->format('Y-m-d H:i:s'));
                // Synthetische Platzhalter-Mail statt einer echten, siehe Plan.
                self::assertStringStartsWith('whatsapp-491511234567@guests.', $cmd->guestEmail);
                return true;
            }))
            ->willReturn($reservation);

        $reply = $this->machine->handle($c, 'ja', [$this->venue]);

        self::assertSame(WhatsappConversationState::COMPLETED, $c->getState());
        self::assertSame($reservationId, $c->getReservationId());
        self::assertStringContainsString('bestätigt', $reply);
    }

    public function testDomainExceptionDuringConfirmationRoutesBackToAwaitingTime(): void
    {
        $c = $this->newConversation();
        $c->setDraftPartySize(2);
        $c->setDraftDate(new \DateTimeImmutable('2026-11-22'));
        $c->setDraftTime('19:00');
        $c->setDraftName('Erika Musterfrau');
        $c->setState(WhatsappConversationState::AWAITING_CONFIRMATION);

        $this->reservationCreator->method('createReservation')
            ->willThrowException(new \DomainException('Dieser Tisch ist nicht mehr frei.'));

        $reply = $this->machine->handle($c, 'ja', [$this->venue]);

        self::assertSame(WhatsappConversationState::AWAITING_TIME, $c->getState());
        self::assertStringContainsString('nicht mehr frei', $reply);
    }

    public function testTerminalStateReturnsFixedMessageWithoutMutation(): void
    {
        $c = $this->newConversation();
        $c->setState(WhatsappConversationState::COMPLETED);

        $reply = $this->machine->handle($c, 'noch was?', [$this->venue]);

        self::assertSame(WhatsappConversationState::COMPLETED, $c->getState());
        self::assertStringContainsString('bereits abgeschlossen', $reply);
    }

    // ── Raumauswahl (nur bei mehreren aktiven Venues) ──────────────────────

    private function newConversationAwaitingVenue(): WhatsappConversation
    {
        $c = new WhatsappConversation($this->tenant, '491511234567', 'Max Mustermann');
        $c->setState(WhatsappConversationState::AWAITING_VENUE);
        return $c;
    }

    public function testVenueSelectionByNumberAdvancesToPartySize(): void
    {
        $c = $this->newConversationAwaitingVenue();

        $reply = $this->machine->handle($c, '2', [$this->venue, $this->venue2]);

        self::assertSame(WhatsappConversationState::AWAITING_PARTY_SIZE, $c->getState());
        self::assertSame($this->venue2, $c->getVenue());
        self::assertStringContainsString('Personen', $reply);
    }

    public function testVenueSelectionByNameAdvancesToPartySize(): void
    {
        $c = $this->newConversationAwaitingVenue();

        $reply = $this->machine->handle($c, 'hauptraum', [$this->venue, $this->venue2]);

        self::assertSame(WhatsappConversationState::AWAITING_PARTY_SIZE, $c->getState());
        self::assertSame($this->venue, $c->getVenue());
        self::assertStringContainsString('Personen', $reply);
    }

    public function testInvalidVenueSelectionRepromptsWithNumberedList(): void
    {
        $c = $this->newConversationAwaitingVenue();

        $reply = $this->machine->handle($c, 'Wintergarten', [$this->venue, $this->venue2]);

        self::assertSame(WhatsappConversationState::AWAITING_VENUE, $c->getState());
        self::assertNull($c->getVenue());
        self::assertSame(1, $c->getRetryCount());
        self::assertStringContainsString('1) Hauptraum', $reply);
        self::assertStringContainsString('2) Hochzeitsraum', $reply);
    }

    public function testSingleVenueConversationNeverEntersVenueSelection(): void
    {
        // Simuliert den v1-Standardfall (InboundMessageReceivedHandler setzt bei
        // genau einem aktiven Venue die Venue direkt und startet bei party_size).
        $c = $this->newConversation();

        self::assertSame(WhatsappConversationState::AWAITING_PARTY_SIZE, $c->getState());
        self::assertSame($this->venue, $c->getVenue());
    }
}
