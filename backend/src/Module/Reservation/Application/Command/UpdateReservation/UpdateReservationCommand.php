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
        public ?string $guestFirstName = null,
        public ?string $occasion = null,
        /** false = not provided (no change); null = unassign; int = assign this table number */
        public int|false|null $tableNumber = false,
        /** false = not provided (no change); null = clear; array = set multi-table IDs */
        public array|false|null $tableIds = false,
        /** null = no change; string UUID = move reservation to this venue/room */
        public ?string $venueId = null,
    ) {}
}
