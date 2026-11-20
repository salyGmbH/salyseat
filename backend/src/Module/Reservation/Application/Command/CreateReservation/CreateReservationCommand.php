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
        public ?int $tableNumber = null,
        /** Mehrfach-Tischauswahl (zusammengelegte Tische) — null/leer = nur $tableNumber. */
        public ?array $tableIds = null,
        public ?int $durationMinutes = null,
        public bool $adminOverride = false,
        public ?string $source = null,
        public ?string $hotelRoomNumber = null,
        public ?int $performedByEmployeeNumber = null,
        public ?string $performedByName = null,
        /**
         * Package-Auswahl mit Menge — wird serverseitig gegen
         * tenant.uiSettings.packages validiert (Existenz, aktiv, Summe <= partySize).
         *
         * @var array<int, array{package_id: string, quantity: int}>|null
         */
        public ?array $packages = null,
    ) {}
}
