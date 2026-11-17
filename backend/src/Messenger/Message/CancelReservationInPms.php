<?php

declare(strict_types=1);

namespace App\Messenger\Message;

final readonly class CancelReservationInPms
{
    public function __construct(
        public string $mewsReservationId,
        public string $tenantId,
    ) {}
}