<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Repository;

use App\Module\Reservation\Domain\Entity\Guest;
use Symfony\Component\Uid\Uuid;

interface GuestRepositoryInterface
{
    public function findById(Uuid $id): ?Guest;

    public function findByTenantAndEmail(Uuid $tenantId, string $email): ?Guest;

    /** @return Guest[] */
    public function listByTenant(Uuid $tenantId, ?string $search, int $limit, int $offset): array;

    public function countByTenant(Uuid $tenantId, ?string $search): int;

    public function save(Guest $guest): void;
}
