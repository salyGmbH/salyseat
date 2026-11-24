<?php

declare(strict_types=1);

namespace App\Messenger\Message;

final readonly class SendWaitlistNotification
{
    public function __construct(
        public string $waitlistEntryId,
        public string $venueName,
        public string $notifyEmail,
        public string $guestName,
        public string $guestEmail,
        public ?string $guestPhone,
        public int $partySize,
        public string $requestedAt,
        public int $answerHours,
        public ?string $guestFirstName = null,
    ) {}
}
