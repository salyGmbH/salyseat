<?php

declare(strict_types=1);

namespace App\Module\Shift\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'shift_templates')]
#[ORM\Index(name: 'idx_templates_tenant', columns: ['tenant_id'])]
class ShiftTemplate
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 255)]
    private string $name;

    /** Array von Wochentag-Einträgen als JSON */
    #[ORM\Column(type: 'json')]
    private array $entries = [];

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Tenant $tenant, string $name, array $entries)
    {
        $this->id        = Uuid::v7();
        $this->tenant    = $tenant;
        $this->name      = $name;
        $this->entries   = $entries;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid               { return $this->id; }
    public function getTenant(): Tenant         { return $this->tenant; }
    public function getName(): string           { return $this->name; }
    public function getEntries(): array         { return $this->entries; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}