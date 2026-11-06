<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\ConfirmReservation;

final readonly class ConfirmReservationCommand
{
    public function __construct(
        public string $reservationId,
        public string $tenantId,
    ) {}
}
