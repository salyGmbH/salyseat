<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Repository;

use App\Module\Reservation\Domain\Entity\Guest;
use Symfony\Component\Uid\Uuid;

interface GuestRepositoryInterface
{
    public function findById(Uuid $id): ?Guest;

    public function findByTenantAndEmail(Uuid $tenantId, string $email): ?Guest;

    public function save(Guest $guest): void;
}
