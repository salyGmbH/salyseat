<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\CancelReservation;

final readonly class CancelReservationCommand
{
    public function __construct(
        public string $token,
    ) {}
}
