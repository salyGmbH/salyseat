<?php

declare(strict_types=1);

namespace App\Module\User\Application\Query\GetUsersByTenant;

use Symfony\Component\Uid\Uuid;

/**
 * Query = lesende Anfrage. Trägt nur den Filter.
 */
final readonly class GetUsersByTenantQuery
{
    public function __construct(
        public Uuid $tenantId,
    ) {}
}
