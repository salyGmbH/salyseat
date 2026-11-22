<?php

declare(strict_types=1);

namespace App\Module\Tenant\Domain\Entity;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity(repositoryClass: DoctrineTenantRepository::class)]
#[ORM\Table(name: 'tenants')]
#[ORM\HasLifecycleCallbacks]
class Tenant
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 100, unique: true)]
    private string $slug;

    /** Wird vom Widget zur Identifikation genutzt */
    #[ORM\Column(length: 64, unique: true)]
    private string $publicKey;

    #[ORM\Column(length: 50, options: ['default' => 'tisch'])]
    private string $plan = 'tisch'; // tisch | menu | maitre

    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    #[ORM\OneToOne(mappedBy: 'tenant', cascade: ['persist', 'remove'])]
    private ?TenantBranding $branding = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $uiSettings = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $pmsConfig = null;

    /** Meta-style phone_number_id — primäre Zuordnung eingehender WhatsApp-Webhooks. */
    #[ORM\Column(length: 64, unique: true, nullable: true)]
    private ?string $whatsappPhoneNumberId = null;

    /** 360dialog channel/WABA-Id — sekundäre Zuordnung, falls das Payload nur diese trägt. */
    #[ORM\Column(length: 64, unique: true, nullable: true)]
    private ?string $whatsappChannelId = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $whatsappConfig = null;

    /** Opakes Secret für die private .ics-Kalender-Abo-URL — lazy generiert bei erster Anfrage. */
    #[ORM\Column(length: 64, unique: true, nullable: true)]
    private ?string $calendarFeedToken = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $contactEmail = null;

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $contactPhone = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $address = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $billingAddress = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $internalNotes = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $contractDuration = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $cancellationPeriod = null;

    #[ORM\Column(type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $contractStart = null;

    public function __construct(string $name, string $slug)
    {
        $this->id = Uuid::v7();
        $this->name = $name;
        $this->slug = $slug;
        $this->publicKey = bin2hex(random_bytes(24));
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
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
    public function getName(): string
    {
        return $this->name;
    }
    public function getSlug(): string
    {
        return $this->slug;
    }
    public function getPublicKey(): string
    {
        return $this->publicKey;
    }
    public function getPlan(): string
    {
        return $this->plan;
    }
    public function isActive(): bool
    {
        return $this->active;
    }
    public function getBranding(): ?TenantBranding
    {
        return $this->branding;
    }

    public function getUiSettings(): ?array
    {
        return $this->uiSettings;
    }

    public function setUiSettings(?array $settings): void
    {
        $this->uiSettings = $settings;
    }
    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getPmsConfig(): ?array
    {
        return $this->pmsConfig;
    }

    public function setPmsConfig(?array $config): void
    {
        $this->pmsConfig = $config;
    }

    public function getWhatsappPhoneNumberId(): ?string
    {
        return $this->whatsappPhoneNumberId;
    }

    public function setWhatsappPhoneNumberId(?string $id): void
    {
        $this->whatsappPhoneNumberId = $id;
    }

    public function getWhatsappChannelId(): ?string
    {
        return $this->whatsappChannelId;
    }

    public function setWhatsappChannelId(?string $id): void
    {
        $this->whatsappChannelId = $id;
    }

    public function getWhatsappConfig(): ?array
    {
        return $this->whatsappConfig;
    }

    public function setWhatsappConfig(?array $config): void
    {
        $this->whatsappConfig = $config;
    }

    public function getCalendarFeedToken(): ?string
    {
        return $this->calendarFeedToken;
    }

    public function setCalendarFeedToken(?string $token): void
    {
        $this->calendarFeedToken = $token;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
    }
    public function activate(): void
    {
        $this->active = true;
    }
    public function suspend(): void
    {
        $this->active = false;
    }
    public function upgradePlan(string $plan): void
    {
        $this->plan = $plan;
    }

    public function getContactEmail(): ?string { return $this->contactEmail; }
    public function setContactEmail(?string $v): void { $this->contactEmail = $v; }

    public function getContactPhone(): ?string { return $this->contactPhone; }
    public function setContactPhone(?string $v): void { $this->contactPhone = $v; }

    public function getAddress(): ?array { return $this->address; }
    public function setAddress(?array $v): void { $this->address = $v; }

    public function getBillingAddress(): ?array { return $this->billingAddress; }
    public function setBillingAddress(?array $v): void { $this->billingAddress = $v; }

    public function getInternalNotes(): ?string { return $this->internalNotes; }
    public function setInternalNotes(?string $v): void { $this->internalNotes = $v; }

    public function getContractDuration(): ?string { return $this->contractDuration; }
    public function setContractDuration(?string $v): void { $this->contractDuration = $v; }

    public function getCancellationPeriod(): ?string { return $this->cancellationPeriod; }
    public function setCancellationPeriod(?string $v): void { $this->cancellationPeriod = $v; }

    public function getContractStart(): ?\DateTimeImmutable { return $this->contractStart; }
    public function setContractStart(?\DateTimeImmutable $v): void { $this->contractStart = $v; }
}
