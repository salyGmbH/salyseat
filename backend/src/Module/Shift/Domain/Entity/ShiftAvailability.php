<?php

declare(strict_types=1);

namespace App\Module\Shift\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'shift_availability')]
#[ORM\UniqueConstraint(name: 'uq_avail_emp_day', columns: ['tenant_id', 'employee_id', 'weekday'])]
class ShiftAvailability
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 36)]
    private string $employeeId;

    /** 0 = Montag … 6 = Sonntag */
    #[ORM\Column(type: 'smallint', options: ['unsigned' => true])]
    private int $weekday;

    /** preferred | available | unavailable */
    #[ORM\Column(length: 20)]
    private string $type;

    public function __construct(Tenant $tenant, string $employeeId, int $weekday, string $type)
    {
        $this->id         = Uuid::v7();
        $this->tenant     = $tenant;
        $this->employeeId = $employeeId;
        $this->weekday    = $weekday;
        $this->type       = $type;
    }

    public function getId(): Uuid       { return $this->id; }
    public function getTenant(): Tenant { return $this->tenant; }
    public function getEmployeeId(): string { return $this->employeeId; }
    public function getWeekday(): int   { return $this->weekday; }
    public function getType(): string   { return $this->type; }

    public function setType(string $type): void { $this->type = $type; }
}