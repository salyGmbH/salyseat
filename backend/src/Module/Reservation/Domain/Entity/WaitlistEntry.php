<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Ein Gast, der sich für einen ausgebuchten Zeitslot auf die Warteliste
 * gesetzt hat (Feature "Automatische Warteliste" in den Widget-Einstellungen).
 */
#[ORM\Entity]
#[ORM\Table(name: 'waitlist_entries')]
#[ORM\Index(name: 'idx_waitlist_tenant', columns: ['tenant_id'])]
#[ORM\Index(name: 'idx_waitlist_venue_requested', columns: ['venue_id', 'requested_at'])]
#[ORM\HasLifecycleCallbacks]
class WaitlistEntry
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private Venue $venue;

    /** Der konkrete, ausgebuchte Zeitslot für den sich der Gast eingetragen hat */
    #[ORM\Column]
    private \DateTimeImmutable $requestedAt;

    #[ORM\Column]
    private int $partySize;

    #[ORM\Column(length: 255)]
    private string $guestName;

    #[ORM\Column(length: 255)]
    private string $guestEmail;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $guestPhone = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(length: 20, options: ['default' => WaitlistStatus::WAITING])]
    private string $status = WaitlistStatus::WAITING;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        Tenant $tenant,
        Venue $venue,
        \DateTimeImmutable $requestedAt,
        int $partySize,
        string $guestName,
        string $guestEmail,
        ?string $guestPhone = null,
        ?string $notes = null,
    ) {
        $this->id          = Uuid::v7();
        $this->tenant       = $tenant;
        $this->venue        = $venue;
        $this->requestedAt  = $requestedAt;
        $this->partySize    = $partySize;
        $this->guestName    = $guestName;
        $this->guestEmail   = strtolower(trim($guestEmail));
        $this->guestPhone   = $guestPhone;
        $this->notes        = $notes;
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

    public function getVenue(): Venue
    {
        return $this->venue;
    }

    public function getRequestedAt(): \DateTimeImmutable
    {
        return $this->requestedAt;
    }

    public function getPartySize(): int
    {
        return $this->partySize;
    }

    public function getGuestName(): string
    {
        return $this->guestName;
    }

    public function getGuestEmail(): string
    {
        return $this->guestEmail;
    }

    public function getGuestPhone(): ?string
    {
        return $this->guestPhone;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function markNotified(): void
    {
        $this->status = WaitlistStatus::NOTIFIED;
    }

    public function markConverted(): void
    {
        $this->status = WaitlistStatus::CONVERTED;
    }

    public function markCancelled(): void
    {
        $this->status = WaitlistStatus::CANCELLED;
    }
}
