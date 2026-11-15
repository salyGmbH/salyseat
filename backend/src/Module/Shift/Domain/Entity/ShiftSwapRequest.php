<?php

declare(strict_types=1);

namespace App\Module\Shift\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'shift_swap_requests')]
#[ORM\Index(name: 'idx_swaps_tenant', columns: ['tenant_id'])]
class ShiftSwapRequest
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 36)]
    private string $fromEmployeeId;

    #[ORM\Column(length: 36)]
    private string $toEmployeeId;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $date;

    /** pending | accepted | rejected */
    #[ORM\Column(length: 20, options: ['default' => 'pending'])]
    private string $status = 'pending';

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $note = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(
        Tenant $tenant,
        string $fromEmployeeId,
        string $toEmployeeId,
        \DateTimeImmutable $date,
        ?string $note = null,
    ) {
        $this->id             = Uuid::v7();
        $this->tenant         = $tenant;
        $this->fromEmployeeId = $fromEmployeeId;
        $this->toEmployeeId   = $toEmployeeId;
        $this->date           = $date;
        $this->note           = $note;
        $this->createdAt      = new \DateTimeImmutable();
    }

    public function getId(): Uuid               { return $this->id; }
    public function getTenant(): Tenant         { return $this->tenant; }
    public function getFromEmployeeId(): string { return $this->fromEmployeeId; }
    public function getToEmployeeId(): string   { return $this->toEmployeeId; }
    public function getDate(): \DateTimeImmutable { return $this->date; }
    public function getStatus(): string         { return $this->status; }
    public function getNote(): ?string          { return $this->note; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function setStatus(string $status): void { $this->status = $status; }
}