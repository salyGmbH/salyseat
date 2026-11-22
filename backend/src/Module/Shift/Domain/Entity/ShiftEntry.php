<?php

declare(strict_types=1);

namespace App\Module\Shift\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'shifts')]
#[ORM\UniqueConstraint(name: 'uq_shift_emp_date', columns: ['tenant_id', 'employee_id', 'date'])]
#[ORM\Index(name: 'idx_shifts_tenant_date', columns: ['tenant_id', 'date'])]
class ShiftEntry
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 36)]
    private string $employeeId;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $date;

    #[ORM\Column(length: 36)]
    private string $type;

    #[ORM\Column(length: 5, nullable: true)]
    private ?string $startTime = null;

    #[ORM\Column(length: 5, nullable: true)]
    private ?string $endTime = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $note = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(
        Tenant $tenant,
        string $employeeId,
        \DateTimeImmutable $date,
        string $type,
        ?string $startTime = null,
        ?string $endTime   = null,
        ?string $note      = null,
    ) {
        $this->id         = Uuid::v7();
        $this->tenant     = $tenant;
        $this->employeeId = $employeeId;
        $this->date       = $date;
        $this->type       = $type;
        $this->startTime  = $startTime;
        $this->endTime    = $endTime;
        $this->note       = $note;
        $this->createdAt  = new \DateTimeImmutable();
    }

    public function getId(): Uuid                     { return $this->id; }
    public function getTenant(): Tenant               { return $this->tenant; }
    public function getEmployeeId(): string           { return $this->employeeId; }
    public function getDate(): \DateTimeImmutable     { return $this->date; }
    public function getType(): string                 { return $this->type; }
    public function getStartTime(): ?string           { return $this->startTime; }
    public function getEndTime(): ?string             { return $this->endTime; }
    public function getNote(): ?string                { return $this->note; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function update(string $type, ?string $startTime, ?string $endTime, ?string $note): void
    {
        $this->type      = $type;
        $this->startTime = $startTime;
        $this->endTime   = $endTime;
        $this->note      = $note;
    }

    public function setEmployeeId(string $employeeId): void
    {
        $this->employeeId = $employeeId;
    }
}
