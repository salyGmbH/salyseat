<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\JoinWaitlist;

final readonly class JoinWaitlistCommand
{
    public function __construct(
        public string $venueId,
        public \DateTimeImmutable $requestedAt,
        public int $partySize,
        public string $guestName,
        public string $guestEmail,
        public ?string $guestPhone = null,
        public ?string $notes = null,
        public ?string $guestFirstName = null,
    ) {}
}
