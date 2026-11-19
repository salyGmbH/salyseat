<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

final class WaitlistStatus
{
    public const WAITING   = 'waiting';    // Wartet auf einen freiwerdenden Platz
    public const NOTIFIED  = 'notified';   // Gast wurde kontaktiert, wartet auf Antwort
    public const CONVERTED = 'converted';  // Gast hat einen Platz erhalten / Reservierung erstellt
    public const CANCELLED = 'cancelled';  // Verworfen (durch Gast oder Admin)

    public const ALL = [
        self::WAITING,
        self::NOTIFIED,
        self::CONVERTED,
        self::CANCELLED,
    ];
}
