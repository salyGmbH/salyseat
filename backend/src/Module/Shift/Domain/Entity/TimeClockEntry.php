<?php

declare(strict_types=1);

namespace App\Module\Shift\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'time_clock_entries')]
#[ORM\Index(name: 'idx_time_clock_tenant_employee', columns: ['tenant_id', 'employee_id'])]
class TimeClockEntry
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 36)]
    private string $employeeId;

    #[ORM\Column]
    private \DateTimeImmutable $clockInAt;

    /** null = Mitarbeiter ist aktuell noch eingecheckt */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $clockOutAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $note = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(Tenant $tenant, string $employeeId, \DateTimeImmutable $clockInAt)
    {
        $this->id         = Uuid::v7();
        $this->tenant     = $tenant;
        $this->employeeId = $employeeId;
        $this->clockInAt  = $clockInAt;
        $this->createdAt  = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getTenant(): Tenant { return $this->tenant; }
    public function getEmployeeId(): string { return $this->employeeId; }
    public function getClockInAt(): \DateTimeImmutable { return $this->clockInAt; }
    public function getClockOutAt(): ?\DateTimeImmutable { return $this->clockOutAt; }
    public function getNote(): ?string { return $this->note; }
    public function isOpen(): bool { return $this->clockOutAt === null; }

    public function clockOut(\DateTimeImmutable $at, ?string $note = null): void
    {
        $this->clockOutAt = $at;
        if ($note !== null) {
            $this->note = $note;
        }
    }
}