<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\ListGuests;

final readonly class ListGuestsQuery
{
    public function __construct(
        public string $tenantId,
        public ?string $search = null,
        public int $limit = 100,
        public int $offset = 0,
    ) {}
}
