<?php

declare(strict_types=1);

namespace App\Module\Tenant\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Globaler Add-on-Katalogeintrag (nicht tenant-spezifisch) — wird vom
 * Superadmin gepflegt und in der Admin-Abo-Seite als buchbares Add-on
 * angezeigt. $key ist die stabile Kennung, die auf tenant.uiSettings.addons
 * referenziert wird (z.B. "vouchers", "packages") — nach dem Anlegen nicht
 * mehr ändern, sonst verlieren bestehende Tenants ihre Zuordnung.
 */
#[ORM\Entity]
#[ORM\Table(name: 'addons')]
#[ORM\HasLifecycleCallbacks]
class AddOn
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\Column(name: '`key`', length: 50, unique: true)]
    private string $key;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    /** null = "Auf Anfrage" */
    #[ORM\Column(nullable: true)]
    private ?int $priceCents = null;

    /** Mindest-Plan um dieses Add-on buchen zu können — null = ab jedem Plan buchbar. */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $minPlan = null;

    /** Ab welchem Plan das Add-on automatisch (kostenlos) enthalten ist — null = nie automatisch. */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $includedFromPlan = null;

    #[ORM\Column(length: 50, options: ['default' => 'extension'])]
    private string $icon = 'extension';

    /** 'active' | 'soon' */
    #[ORM\Column(length: 20, options: ['default' => 'active'])]
    private string $status = 'active';

    #[ORM\Column(options: ['default' => 0])]
    private int $sortOrder = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(string $key, string $name)
    {
        $this->id        = Uuid::v7();
        $this->key       = $key;
        $this->name      = $name;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getKey(): string { return $this->key; }
    public function getName(): string { return $this->name; }
    public function getDescription(): ?string { return $this->description; }
    public function getPriceCents(): ?int { return $this->priceCents; }
    public function getMinPlan(): ?string { return $this->minPlan; }
    public function getIncludedFromPlan(): ?string { return $this->includedFromPlan; }
    public function getIcon(): string { return $this->icon; }
    public function getStatus(): string { return $this->status; }
    public function getSortOrder(): int { return $this->sortOrder; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function update(
        string $name,
        ?string $description,
        ?int $priceCents,
        ?string $minPlan,
        ?string $includedFromPlan,
        string $icon,
        string $status,
        int $sortOrder,
    ): void {
        $this->name             = $name;
        $this->description      = $description;
        $this->priceCents       = $priceCents;
        $this->minPlan          = $minPlan;
        $this->includedFromPlan = $includedFromPlan;
        $this->icon             = $icon;
        $this->status           = $status;
        $this->sortOrder        = $sortOrder;
    }
}