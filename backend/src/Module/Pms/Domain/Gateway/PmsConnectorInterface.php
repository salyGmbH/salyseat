<?php

declare(strict_types=1);

namespace App\Module\Pms\Domain\Gateway;

use App\Module\Reservation\Domain\Entity\Reservation;

interface PmsConnectorInterface
{
    public function isEnabled(): bool;

    /** Überträgt eine Reservierung ans PMS und gibt die externe ID zurück. */
    public function pushReservation(Reservation $reservation): string;

    /** Storniert eine zuvor übertragene Reservierung im PMS. */
    public function cancelReservation(string $externalId): void;

    /**
     * Sucht Hotelgäste nach Name oder E-Mail.
     * @return array<array{id: string, firstName: string, lastName: string, email: string|null, phone: string|null, number: string}>
     */
    public function searchGuests(string $query): array;

    /**
     * Gibt alle aktuell eingecheckten Hotelgäste zurück.
     * @return array<array{id: string, firstName: string, lastName: string, email: string|null, phone: string|null, number: string, checkIn: string, checkOut: string, roomNumber: string|null}>
     */
    public function getInHouseGuests(): array;
}