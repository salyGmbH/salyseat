<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Query\GetReservationByToken;

final readonly class GetReservationByTokenQuery
{
    public function __construct(
        public string $token,
    ) {}
}
