<?php

declare(strict_types=1);

namespace App\Module\Dashboard\Application\Query;

final readonly class DashboardStatsQuery
{
    public function __construct(
        public string $tenantId,
    ) {}
}
