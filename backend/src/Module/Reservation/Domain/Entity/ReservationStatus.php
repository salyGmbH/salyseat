<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

final class ReservationStatus
{
    public const PENDING   = 'pending';    // Erstellt, noch nicht bestätigt
    public const CONFIRMED = 'confirmed';  // Eingecheckt / Gast ist da
    public const COMPLETED = 'completed';  // Besuch beendet
    public const CANCELLED = 'cancelled';  // Storniert (durch Gast oder Admin)
    public const NO_SHOW   = 'no_show';    // Gast erschien nicht

    public const ALL = [self::PENDING, self::CONFIRMED, self::COMPLETED, self::CANCELLED, self::NO_SHOW];
}
