<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\UpdateReservation;

final readonly class UpdateReservationCommand
{
    public function __construct(
        public string $reservationId,
        public string $tenantId,
        public ?string $guestName = null,
        public ?int $partySize = null,
        public ?\DateTimeImmutable $startsAt = null,
        public ?int $durationMinutes = null,
        public ?string $guestPhone = null,
        public ?string $guestNotes = null,
    ) {}
}
