<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\ListReservations;

final readonly class ListReservationsQuery
{
    public function __construct(
        public string $tenantId,
        public ?string $status = null,
        public ?string $date = null,
        public int $limit = 50,
        public int $offset = 0,
    ) {}
}
