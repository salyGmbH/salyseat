<?php

declare(strict_types=1);

namespace App\Module\User\Domain\Repository;

use App\Module\User\Domain\Entity\User;
use Symfony\Component\Uid\Uuid;

interface UserRepositoryInterface
{
    public function findById(Uuid $id): ?User;

    public function findByEmail(string $email): ?User;

    /** @return User[] */
    public function findAllByTenant(Uuid $tenantId): array;

    public function save(User $user): void;

    public function remove(User $user): void;
}
