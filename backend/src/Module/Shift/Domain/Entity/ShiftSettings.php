<?php

declare(strict_types=1);

namespace App\Module\Shift\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'shift_settings')]
#[ORM\UniqueConstraint(name: 'uq_settings_tenant', columns: ['tenant_id'])]
class ShiftSettings
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    /** Stunden/Woche bevor Überstunden beginnen */
    #[ORM\Column(type: 'smallint', options: ['unsigned' => true, 'default' => 40])]
    private int $overtimeLimit = 40;

    /** Mindestbesetzung pro Wochentag [Mo..So], 7 Einträge */
    #[ORM\Column(type: 'json')]
    private array $minStaff = [2, 2, 2, 2, 2, 1, 1];

    public function __construct(Tenant $tenant)
    {
        $this->id     = Uuid::v7();
        $this->tenant = $tenant;
    }

    public function getId(): Uuid       { return $this->id; }
    public function getTenant(): Tenant { return $this->tenant; }
    public function getOvertimeLimit(): int { return $this->overtimeLimit; }
    public function getMinStaff(): array    { return $this->minStaff; }

    public function setOvertimeLimit(int $limit): void { $this->overtimeLimit = max(1, $limit); }
    public function setMinStaff(array $minStaff): void { $this->minStaff = $minStaff; }
}
