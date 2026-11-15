<?php

declare(strict_types=1);

namespace App\Module\Shift\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'shift_wages')]
#[ORM\UniqueConstraint(name: 'uq_wages_emp', columns: ['tenant_id', 'employee_id'])]
class ShiftWage
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 36)]
    private string $employeeId;

    #[ORM\Column(type: 'decimal', precision: 8, scale: 2)]
    private string $hourlyRate;

    public function __construct(Tenant $tenant, string $employeeId, float $hourlyRate)
    {
        $this->id         = Uuid::v7();
        $this->tenant     = $tenant;
        $this->employeeId = $employeeId;
        $this->hourlyRate = (string) $hourlyRate;
    }

    public function getId(): Uuid       { return $this->id; }
    public function getTenant(): Tenant { return $this->tenant; }
    public function getEmployeeId(): string { return $this->employeeId; }
    public function getHourlyRate(): float  { return (float) $this->hourlyRate; }

    public function setHourlyRate(float $rate): void { $this->hourlyRate = (string) $rate; }
}