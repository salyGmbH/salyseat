<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\CompleteReservation;

final readonly class CompleteReservationCommand
{
    public function __construct(
        public string $reservationId,
        public string $tenantId,
    ) {}
}
