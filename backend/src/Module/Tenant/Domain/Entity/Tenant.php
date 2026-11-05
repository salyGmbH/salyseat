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

    #[ORM\Column(length: 50, options: ['default' => 'trial'])]
    private string $plan = 'trial'; // trial | starter | professional | enterprise

    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    #[ORM\OneToOne(mappedBy: 'tenant', cascade: ['persist', 'remove'])]
    private ?TenantBranding $branding = null;

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
    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
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
}
