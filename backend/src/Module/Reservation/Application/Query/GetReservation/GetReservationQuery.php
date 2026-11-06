<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\GetReservation;

final readonly class GetReservationQuery
{
    public function __construct(
        public string $reservationId,
        public string $tenantId,
    ) {}
}
