<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Der laufende Buchungsdialog eines Gastes mit dem WhatsApp-Bot (v1: nur
 * Neuanlage einer Reservierung — Personenzahl → Datum → Uhrzeit → Name →
 * Bestätigung). Eine neue eingehende Nachricht ohne offene Konversation
 * startet einen frischen Dialog; abgeschlossene/verworfene Dialoge bleiben
 * als Historie stehen (kein Update-in-place über Buchungen hinweg).
 */
#[ORM\Entity]
#[ORM\Table(name: 'whatsapp_conversations')]
#[ORM\Index(name: 'idx_whatsapp_conversations_tenant_phone', columns: ['tenant_id', 'guest_phone'])]
#[ORM\Index(name: 'idx_whatsapp_conversations_last_msg', columns: ['last_inbound_message_id'])]
#[ORM\HasLifecycleCallbacks]
class WhatsappConversation
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(name: 'tenant_id', nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(name: 'venue_id', nullable: true)]
    private ?Venue $venue = null;

    #[ORM\Column(length: 20)]
    private string $guestPhone;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $guestWaName = null;

    #[ORM\Column(length: 30, options: ['default' => WhatsappConversationState::AWAITING_PARTY_SIZE])]
    private string $state = WhatsappConversationState::AWAITING_PARTY_SIZE;

    #[ORM\Column(type: 'smallint', nullable: true)]
    private ?int $draftPartySize = null;

    #[ORM\Column(type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $draftDate = null;

    /** 'HH:MM' */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $draftTime = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $draftName = null;

    /** Zuletzt an den Gast gesendete nummerierte Uhrzeiten-Liste, für die Zuordnung "2" -> "19:00". */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $offeredSlots = null;

    #[ORM\Column(type: UuidType::NAME, nullable: true)]
    private ?Uuid $reservationId = null;

    /** Dedupe-Key gegen erneut zugestellte Webhook-Events (WhatsApp/360dialog Retries). */
    #[ORM\Column(length: 128, nullable: true)]
    private ?string $lastInboundMessageId = null;

    #[ORM\Column(type: 'smallint', options: ['default' => 0])]
    private int $retryCount = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Tenant $tenant, string $guestPhone, ?string $guestWaName = null)
    {
        $this->id          = Uuid::v7();
        $this->tenant       = $tenant;
        $this->guestPhone   = $guestPhone;
        $this->guestWaName  = $guestWaName;
        $this->createdAt    = new \DateTimeImmutable();
        $this->updatedAt    = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getTenant(): Tenant
    {
        return $this->tenant;
    }

    public function getVenue(): ?Venue
    {
        return $this->venue;
    }

    public function setVenue(?Venue $venue): void
    {
        $this->venue = $venue;
    }

    public function getGuestPhone(): string
    {
        return $this->guestPhone;
    }

    public function getGuestWaName(): ?string
    {
        return $this->guestWaName;
    }

    public function getState(): string
    {
        return $this->state;
    }

    public function setState(string $state): void
    {
        $this->state = $state;
    }

    public function isOpen(): bool
    {
        return !in_array($this->state, WhatsappConversationState::TERMINAL, true);
    }

    public function getDraftPartySize(): ?int
    {
        return $this->draftPartySize;
    }

    public function setDraftPartySize(?int $partySize): void
    {
        $this->draftPartySize = $partySize;
    }

    public function getDraftDate(): ?\DateTimeImmutable
    {
        return $this->draftDate;
    }

    public function setDraftDate(?\DateTimeImmutable $date): void
    {
        $this->draftDate = $date;
    }

    public function getDraftTime(): ?string
    {
        return $this->draftTime;
    }

    public function setDraftTime(?string $time): void
    {
        $this->draftTime = $time;
    }

    public function getDraftName(): ?string
    {
        return $this->draftName;
    }

    public function setDraftName(?string $name): void
    {
        $this->draftName = $name;
    }

    public function getOfferedSlots(): ?array
    {
        return $this->offeredSlots;
    }

    public function setOfferedSlots(?array $slots): void
    {
        $this->offeredSlots = $slots;
    }

    public function getReservationId(): ?Uuid
    {
        return $this->reservationId;
    }

    public function setReservationId(?Uuid $id): void
    {
        $this->reservationId = $id;
    }

    public function getLastInboundMessageId(): ?string
    {
        return $this->lastInboundMessageId;
    }

    public function setLastInboundMessageId(?string $id): void
    {
        $this->lastInboundMessageId = $id;
    }

    public function getRetryCount(): int
    {
        return $this->retryCount;
    }

    public function incrementRetryCount(): void
    {
        $this->retryCount++;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }
}