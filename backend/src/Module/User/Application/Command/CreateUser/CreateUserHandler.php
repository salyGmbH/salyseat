<?php

declare(strict_types=1);

namespace App\Module\User\Application\Command\CreateUser;

use App\Module\Tenant\Domain\Repository\TenantRepositoryInterface;
use App\Module\User\Domain\Entity\User;
use App\Module\User\Domain\Repository\UserRepositoryInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Der Handler führt genau einen Use Case aus: "Lege einen neuen User an."
 *
 * Er:
 *   1. prüft ob die E-Mail schon vergeben ist
 *   2. lädt den Tenant (falls angegeben)
 *   3. erstellt den User
 *   4. hasht das Passwort
 *   5. speichert über das Repository-Interface (kein Doctrine direkt!)
 *
 * Der Handler kennt NUR Interfaces – nie konkrete Implementierungen.
 */
final class CreateUserHandler
{
    public function __construct(
        private readonly UserRepositoryInterface      $users,
        private readonly TenantRepositoryInterface    $tenants,
        private readonly UserPasswordHasherInterface  $hasher,
    ) {}

    public function __invoke(CreateUserCommand $command): User
    {
        if ($this->users->findByEmail($command->email) !== null) {
            throw new \DomainException("E-Mail '{$command->email}' ist bereits vergeben.");
        }

        $user = new User($command->email, $command->roles);

        if ($command->tenantId !== null) {
            $tenant = $this->tenants->findById($command->tenantId)
                ?? throw new \DomainException("Tenant '{$command->tenantId}' nicht gefunden.");
            $user->setTenant($tenant);
        }

        $user->setPassword($this->hasher->hashPassword($user, $command->plainPassword));

        $this->users->save($user);

        return $user;
    }
}
