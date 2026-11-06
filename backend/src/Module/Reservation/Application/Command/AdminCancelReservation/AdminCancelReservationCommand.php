<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\AdminCancelReservation;

final readonly class AdminCancelReservationCommand
{
    public function __construct(
        public string $reservationId,
        public string $tenantId,
    ) {}
}
