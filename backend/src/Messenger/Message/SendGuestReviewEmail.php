<?php

declare(strict_types=1);

namespace App\Messenger\Message;

final readonly class SendGuestReviewEmail
{
    public function __construct(
        public string $reservationId,
        public string $guestEmail,
        public string $guestName,
        public string $venueName,
        public string $token,
        public string $tenantId = '',
    ) {}
}
