<?php

declare(strict_types=1);

namespace App\Module\User\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'users')]
#[UniqueEntity(fields: ['email'], message: 'Diese E-Mail-Adresse ist bereits registriert.')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    /** null = Super-Admin (Platform-Ebene) */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Tenant $tenant = null;

    #[ORM\Column(length: 180, unique: true)]
    private string $email;

    #[ORM\Column]
    private string $password;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $firstName = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $lastName = null;

    /** @var list<string> */
    #[ORM\Column]
    private array $roles = [];

    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(string $email, array $roles = ['ROLE_TENANT_ADMIN'])
    {
        $this->id = Uuid::v7();
        $this->email = $email;
        $this->roles = $roles;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getUserIdentifier(): string
    {
        return $this->email;
    }
    public function getRoles(): array
    {
        return array_unique([...$this->roles, 'ROLE_USER']);
    }
    public function getPassword(): string
    {
        return $this->password;
    }
    public function eraseCredentials(): void {}

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getTenant(): ?Tenant
    {
        return $this->tenant;
    }
    public function getEmail(): string
    {
        return $this->email;
    }
    public function isSuperAdmin(): bool
    {
        return in_array('ROLE_SUPER_ADMIN', $this->roles, true);
    }

    public function setPassword(string $hashedPassword): void
    {
        $this->password = $hashedPassword;
    }
    public function setTenant(?Tenant $tenant): void
    {
        $this->tenant = $tenant;
    }
}
