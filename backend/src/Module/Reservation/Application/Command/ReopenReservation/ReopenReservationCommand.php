<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\ReopenReservation;

final readonly class ReopenReservationCommand
{
    public function __construct(
        public string $reservationId,
        public string $tenantId,
    ) {}
}
