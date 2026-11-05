<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Ein Gast der mindestens einmal bei einem Tenant gebucht hat.
 * Wird automatisch beim ersten Buchen angelegt bzw. per E-Mail gefunden.
 *
 * Ermöglicht:
 * - Stammkunden-Erkennung ("Herr Müller war schon 5x bei uns")
 * - Interne Notizen pro Gast ("Vegetarier", "Fenstertisch bevorzugt")
 * - Sperrliste (No-Show-Kandidaten)
 */
#[ORM\Entity]
#[ORM\Table(name: 'guests')]
#[ORM\UniqueConstraint(name: 'uq_guest_tenant_email', columns: ['tenant_id', 'email'])]
#[ORM\HasLifecycleCallbacks]
class Guest
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    /**
     * Guests gehören zu einem Tenant — nicht global.
     * Gleiche E-Mail kann bei zwei verschiedenen Tenants als unterschiedlicher Gast existieren.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 255)]
    private string $email;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $phone = null;

    /** Interne Notizen des Tenants über diesen Gast — nicht für den Gast sichtbar */
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $internalNotes = null;

    /**
     * Gesperrte Gäste können keine neuen Reservierungen mehr machen.
     * Typischer Grund: wiederholte No-Shows.
     */
    #[ORM\Column(options: ['default' => false])]
    private bool $blocked = false;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $blockedReason = null;

    /** Gesamtanzahl der Reservierungen dieses Gastes (denormalisiert für Performance) */
    #[ORM\Column(options: ['default' => 0])]
    private int $totalReservations = 0;

    /** Anzahl der No-Shows (denormalisiert für schnellen Zugriff) */
    #[ORM\Column(options: ['default' => 0])]
    private int $noShowCount = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    /** @var Collection<int, Reservation> */
    #[ORM\OneToMany(mappedBy: 'guest', targetEntity: Reservation::class)]
    private Collection $reservations;

    public function __construct(Tenant $tenant, string $name, string $email)
    {
        $this->id = Uuid::v7();
        $this->tenant = $tenant;
        $this->name = $name;
        $this->email = strtolower(trim($email));
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
        $this->reservations = new ArrayCollection();
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
    public function getName(): string
    {
        return $this->name;
    }
    public function getEmail(): string
    {
        return $this->email;
    }
    public function getPhone(): ?string
    {
        return $this->phone;
    }
    public function getInternalNotes(): ?string
    {
        return $this->internalNotes;
    }
    public function isBlocked(): bool
    {
        return $this->blocked;
    }
    public function getBlockedReason(): ?string
    {
        return $this->blockedReason;
    }
    public function getTotalReservations(): int
    {
        return $this->totalReservations;
    }
    public function getNoShowCount(): int
    {
        return $this->noShowCount;
    }
    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
    public function getReservations(): Collection
    {
        return $this->reservations;
    }

    /** Zeigt wie zuverlässig der Gast ist (0-100%) */
    public function getReliabilityScore(): int
    {
        if ($this->totalReservations === 0) {
            return 100;
        }

        return (int) round((1 - $this->noShowCount / $this->totalReservations) * 100);
    }

    public function setName(string $name): void
    {
        $this->name = $name;
    }
    public function setPhone(?string $phone): void
    {
        $this->phone = $phone;
    }
    public function setInternalNotes(?string $notes): void
    {
        $this->internalNotes = $notes;
    }

    public function block(string $reason): void
    {
        $this->blocked = true;
        $this->blockedReason = $reason;
    }

    public function unblock(): void
    {
        $this->blocked = false;
        $this->blockedReason = null;
    }

    public function incrementReservations(): void
    {
        $this->totalReservations++;
    }

    public function incrementNoShows(): void
    {
        $this->noShowCount++;
    }
}
