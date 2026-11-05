<?php

declare(strict_types=1);

namespace App\Module\User\Application\Query\GetUsersByTenant;

use App\Module\User\Domain\Entity\User;
use App\Module\User\Domain\Repository\UserRepositoryInterface;

/**
 * Query-Handler: nur lesen, niemals schreiben.
 * Gibt ein Array von User-Entities zurück.
 * Der Controller / API-Layer wandelt diese dann in DTOs / JSON um.
 *
 * @return User[]
 */
final class GetUsersByTenantHandler
{
    public function __construct(
        private readonly UserRepositoryInterface $users,
    ) {}

    /** @return User[] */
    public function __invoke(GetUsersByTenantQuery $query): array
    {
        return $this->users->findAllByTenant($query->tenantId);
    }
}
