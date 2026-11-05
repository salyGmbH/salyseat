<?php

declare(strict_types=1);

namespace App\Messenger\Message;

final readonly class SendReminderEmail
{
    public function __construct(
        public string $reservationId,
        public string $guestEmail,
        public string $guestName,
        public string $startsAt,
        public string $venueName,
    ) {}
}
