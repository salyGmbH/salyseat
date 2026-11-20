<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
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

    #[ORM\Column(nullable: true)]
    private ?int $tableNumber = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $tableIds = null;

    #[ORM\Column]
    private \DateTimeImmutable $startsAt;

    #[ORM\Column]
    private \DateTimeImmutable $endsAt;

    #[ORM\Column(length: 20, options: ['default' => 'pending'])]
    private string $status = ReservationStatus::PENDING;

    /** Internes Admin-Notizfeld */
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $adminNotes = null;

    /** Stripe PaymentIntent ID — null wenn keine Zahlung erforderlich */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $paymentIntentId = null;

    /** Zahlungsstatus: null | 'pending' | 'authorized' | 'paid' | 'captured' | 'released' | 'failed' | 'refunded' */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $paymentStatus = null;

    /** Capture-Methode: null | 'automatic' (Sofortzahlung) | 'manual' (No-Show-Schutz) */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $paymentCaptureMethod = null;

    /** Buchungskanal: 'online' | 'admin' | 'walk_in' */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $source = null;

    /** Zeitstempel wann die Erinnerungs-Mail versendet wurde (null = noch nicht gesendet) */
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $reminderSentAt = null;

    /** Externe Reservierungs-ID im Mews PMS (null = noch nicht synchronisiert) */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $mewsReservationId = null;

    /** PMS-Sync-Status: null | 'synced' | 'failed' */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $pmsSyncStatus = null;

    #[ORM\Column(name: 'hotel_room_number', length: 20, nullable: true)]
    private ?string $hotelRoomNumber = null;

    /**
     * Audit-Trail: wer hat welche Aktion ausgeführt (Mitarbeiter-ID-Abfrage).
     * Append-only-Liste von {employeeNumber, name, action, at}.
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $staffActions = null;

    /** @var Collection<int, ReservationPackage> */
    #[ORM\OneToMany(targetEntity: ReservationPackage::class, mappedBy: 'reservation', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $packages;

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
        $this->packages = new ArrayCollection();
    }

    /** @return Collection<int, ReservationPackage> */
    public function getPackages(): Collection
    {
        return $this->packages;
    }

    public function addPackage(string $packageId, string $packageName, ?int $pricePerPerson, int $quantity): void
    {
        $this->packages->add(new ReservationPackage($this, $packageId, $packageName, $pricePerPerson, $quantity));
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
        $this->status = ReservationStatus::CANCELLED;
    }

    public function markAsNoShow(): void
    {
        $this->status = ReservationStatus::NO_SHOW;
    }

    public function seat(): void
    {
        $this->status = ReservationStatus::SEATED;
    }

    public function startCleanup(): void
    {
        $this->status = ReservationStatus::CLEANUP;
    }

    public function complete(): void
    {
        $this->status = ReservationStatus::COMPLETED;
    }

    public function reopen(): void
    {
        $this->status = ReservationStatus::PENDING;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getVenue(): Venue
    {
        return $this->venue;
    }

    public function moveToVenue(Venue $venue): void
    {
        $this->venue = $venue;
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
    public function getTableNumber(): ?int
    {
        return $this->tableNumber;
    }
    public function setTableNumber(?int $n): void
    {
        $this->tableNumber = $n;
    }

    public function getTableIds(): ?array
    {
        return $this->tableIds;
    }
    public function setTableIds(?array $ids): void
    {
        $this->tableIds = $ids;
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

    public function getReminderSentAt(): ?\DateTimeImmutable
    {
        return $this->reminderSentAt;
    }

    public function markReminderSent(): void
    {
        $this->reminderSentAt = new \DateTimeImmutable();
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

    public function getPaymentIntentId(): ?string      { return $this->paymentIntentId;      }
    public function getPaymentStatus(): ?string        { return $this->paymentStatus;         }
    public function getPaymentCaptureMethod(): ?string { return $this->paymentCaptureMethod;  }

    public function setPaymentIntent(string $intentId, string $captureMethod = 'automatic'): void
    {
        $this->paymentIntentId      = $intentId;
        $this->paymentCaptureMethod = $captureMethod;
        $this->paymentStatus        = $captureMethod === 'manual' ? 'authorized' : 'pending';
    }

    public function markPaymentPaid(): void      { $this->paymentStatus = 'paid';       }
    public function markPaymentAuthorized(): void { $this->paymentStatus = 'authorized'; }
    public function markPaymentCaptured(): void   { $this->paymentStatus = 'captured';   }
    public function markPaymentReleased(): void   { $this->paymentStatus = 'released';   }
    public function markPaymentFailed(): void     { $this->paymentStatus = 'failed';     }
    public function markPaymentRefunded(): void   { $this->paymentStatus = 'refunded';   }

    public function getSource(): ?string { return $this->source; }
    public function setSource(?string $source): void { $this->source = $source; }

    public function getMewsReservationId(): ?string { return $this->mewsReservationId; }
    public function getHotelRoomNumber(): ?string   { return $this->hotelRoomNumber;    }
    public function setHotelRoomNumber(?string $n): void { $this->hotelRoomNumber = $n; }

    public function getPmsSyncStatus(): ?string     { return $this->pmsSyncStatus;     }

    public function getStaffActions(): ?array { return $this->staffActions; }

    public function recordStaffAction(int $employeeNumber, string $name, string $action): void
    {
        $this->staffActions = [
            ...($this->staffActions ?? []),
            [
                'employeeNumber' => $employeeNumber,
                'name'           => $name,
                'action'         => $action,
                'at'             => (new \DateTimeImmutable())->format(DATE_ATOM),
            ],
        ];
    }

    public function setPmsSyncStatus(string $status, ?string $mewsReservationId = null): void
    {
        $this->pmsSyncStatus = $status;
        if ($mewsReservationId !== null) {
            $this->mewsReservationId = $mewsReservationId;
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
