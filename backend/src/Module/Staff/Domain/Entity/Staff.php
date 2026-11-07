<?php

declare(strict_types=1);

namespace App\Module\Staff\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'staff')]
#[ORM\UniqueConstraint(name: 'uq_staff_tenant_number', columns: ['tenant_id', 'employee_number'])]
#[ORM\HasLifecycleCallbacks]
class Staff
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    /** Fortlaufende Nummer pro Tenant, z.B. 1 → wird als #01 angezeigt */
    #[ORM\Column(type: 'smallint', options: ['unsigned' => true])]
    private int $employeeNumber;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $email = null;

    #[ORM\Column(length: 20, options: ['default' => 'staff'])]
    private string $role = 'staff';

    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Tenant $tenant, int $employeeNumber, string $name, ?string $email, string $role)
    {
        $this->id             = Uuid::v7();
        $this->tenant         = $tenant;
        $this->employeeNumber = $employeeNumber;
        $this->name           = trim($name);
        $this->email          = $email !== null ? strtolower(trim($email)) : null;
        $this->role           = $role;
        $this->createdAt      = new \DateTimeImmutable();
        $this->updatedAt      = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid             { return $this->id; }
    public function getTenant(): Tenant       { return $this->tenant; }
    public function getEmployeeNumber(): int  { return $this->employeeNumber; }
    public function getName(): string         { return $this->name; }
    public function getEmail(): ?string       { return $this->email; }
    public function getRole(): string         { return $this->role; }
    public function isActive(): bool          { return $this->active; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function setName(string $name): void    { $this->name = trim($name); }
    public function setEmail(?string $email): void { $this->email = $email !== null ? strtolower(trim($email)) : null; }
    public function setRole(string $role): void    { $this->role = $role; }
    public function setActive(bool $active): void  { $this->active = $active; }
}