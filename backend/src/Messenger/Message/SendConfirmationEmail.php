<?php

declare(strict_types=1);

namespace App\Messenger\Message;

/**
 * Wird nach erfolgreicher Reservierung dispatched.
 * Der Handler versendet die Bestätigungsmail asynchron.
 */
final readonly class SendConfirmationEmail
{
    public function __construct(
        public string $reservationId,
        public string $guestEmail,
        public string $guestName,
        public string $reservationToken,
        public string $startsAt,
        public int $partySize,
        public string $venueName,
    ) {}
}
