<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'reservations')]
#[ORM\HasLifecycleCallbacks]
class Reservation
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private Venue $venue;

    /** Optional — wird gesetzt wenn der Gast bereits im Gästebuch existiert */
    #[ORM\ManyToOne(inversedBy: 'reservations')]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Guest $guest = null;

    /** Öffentlicher Token für Gast-Links (Stornierung, Status) */
    #[ORM\Column(length: 64, unique: true)]
    private string $token;

    // Gast-Informationen (denormalisiert für einfachen Zugriff)
    #[ORM\Column(length: 255)]
    private string $guestName;

    #[ORM\Column(length: 255)]
    private string $guestEmail;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $guestPhone = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $guestNotes = null;

    #[ORM\Column]
    private int $partySize;

    #[ORM\Column]
    private \DateTimeImmutable $startsAt;

    #[ORM\Column]
    private \DateTimeImmutable $endsAt;

    #[ORM\Column(length: 20, options: ['default' => 'pending'])]
    private string $status = ReservationStatus::PENDING;

    /** Internes Admin-Notizfeld */
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $adminNotes = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        Venue $venue,
        string $guestName,
        string $guestEmail,
        int $partySize,
        \DateTimeImmutable $startsAt,
        \DateTimeImmutable $endsAt,
        ?string $guestPhone = null,
        ?string $guestNotes = null,
    ) {
        $this->id = Uuid::v7();
        $this->venue = $venue;
        $this->token = bin2hex(random_bytes(24));
        $this->guestName = $guestName;
        $this->guestEmail = $guestEmail;
        $this->guestPhone = $guestPhone;
        $this->guestNotes = $guestNotes;
        $this->partySize = $partySize;
        $this->startsAt = $startsAt;
        $this->endsAt = $endsAt;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function confirm(): void
    {
        $this->status = ReservationStatus::CONFIRMED;
    }

    public function cancel(): void
    {
        if ($this->status === ReservationStatus::CONFIRMED || $this->status === ReservationStatus::PENDING) {
            $this->status = ReservationStatus::CANCELLED;
        }
    }

    public function markAsNoShow(): void
    {
        $this->status = ReservationStatus::NO_SHOW;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getVenue(): Venue
    {
        return $this->venue;
    }
    public function getToken(): string
    {
        return $this->token;
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
    public function getGuestNotes(): ?string
    {
        return $this->guestNotes;
    }
    public function getPartySize(): int
    {
        return $this->partySize;
    }
    public function getStartsAt(): \DateTimeImmutable
    {
        return $this->startsAt;
    }
    public function getEndsAt(): \DateTimeImmutable
    {
        return $this->endsAt;
    }
    public function getStatus(): string
    {
        return $this->status;
    }
    public function getAdminNotes(): ?string
    {
        return $this->adminNotes;
    }
    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getGuest(): ?Guest
    {
        return $this->guest;
    }

    public function setGuest(?Guest $guest): void
    {
        $this->guest = $guest;
    }

    public function updateDetails(
        ?string $guestName,
        ?int $partySize,
        ?\DateTimeImmutable $startsAt,
        ?\DateTimeImmutable $endsAt,
        ?string $guestPhone,
        ?string $guestNotes,
    ): void {
        if ($guestName !== null) {
            $this->guestName = $guestName;
        }
        if ($partySize !== null) {
            $this->partySize = $partySize;
        }
        if ($startsAt !== null) {
            $this->startsAt = $startsAt;
        }
        if ($endsAt !== null) {
            $this->endsAt = $endsAt;
        }
        if ($guestPhone !== null) {
            $this->guestPhone = $guestPhone !== '' ? $guestPhone : null;
        }
        if ($guestNotes !== null) {
            $this->guestNotes = $guestNotes !== '' ? $guestNotes : null;
        }
    }

    public function isPending(): bool
    {
        return $this->status === ReservationStatus::PENDING;
    }
    public function isConfirmed(): bool
    {
        return $this->status === ReservationStatus::CONFIRMED;
    }
    public function isCancelled(): bool
    {
        return $this->status === ReservationStatus::CANCELLED;
    }
}
