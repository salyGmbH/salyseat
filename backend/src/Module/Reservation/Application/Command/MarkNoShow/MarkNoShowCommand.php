<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\MarkNoShow;

final readonly class MarkNoShowCommand
{
    public function __construct(
        public string $reservationId,
        public string $tenantId,
    ) {}
}
