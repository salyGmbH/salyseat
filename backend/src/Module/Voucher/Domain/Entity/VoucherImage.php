<?php

declare(strict_types=1);

namespace App\Module\Voucher\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherImageRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity(repositoryClass: DoctrineVoucherImageRepository::class)]
#[ORM\Table(name: 'voucher_images')]
class VoucherImage
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 255)]
    private string $name;

    /** Externe URL oder base64 data-URL */
    #[ORM\Column(type: 'text')]
    private string $url;

    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Tenant $tenant, string $name, string $url)
    {
        $this->id        = Uuid::v7();
        $this->tenant    = $tenant;
        $this->name      = $name;
        $this->url       = $url;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function toggle(): void { $this->active = !$this->active; }

    public function getId(): Uuid                      { return $this->id; }
    public function getTenant(): Tenant                { return $this->tenant; }
    public function getName(): string                  { return $this->name; }
    public function getUrl(): string                   { return $this->url; }
    public function isActive(): bool                   { return $this->active; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}