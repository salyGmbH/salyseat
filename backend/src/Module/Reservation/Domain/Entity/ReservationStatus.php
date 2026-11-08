<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

final class ReservationStatus
{
    public const PENDING   = 'pending';    // Erstellt, noch nicht bestätigt
    public const CONFIRMED = 'confirmed';  // Bestätigt / Tisch vorgemerkt
    public const SEATED    = 'seated';     // Gast sitzt / eingecheckt
    public const CLEANUP   = 'cleanup';    // Besuch beendet, Tisch wird gereinigt
    public const COMPLETED = 'completed';  // Besuch beendet und abgeschlossen
    public const CANCELLED = 'cancelled';  // Storniert (durch Gast oder Admin)
    public const NO_SHOW   = 'no_show';    // Gast erschien nicht

    public const ALL = [
        self::PENDING,
        self::CONFIRMED,
        self::SEATED,
        self::CLEANUP,
        self::COMPLETED,
        self::CANCELLED,
        self::NO_SHOW,
    ];
}
