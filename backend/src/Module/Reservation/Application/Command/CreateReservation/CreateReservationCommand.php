<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\CreateReservation;

final readonly class CreateReservationCommand
{
    public function __construct(
        public string $venueId,
        public string $guestName,
        public string $guestEmail,
        public int $partySize,
        public \DateTimeImmutable $startsAt,
        public ?string $guestPhone = null,
        public ?string $guestNotes = null,
    ) {}
}
