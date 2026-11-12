<?php

declare(strict_types=1);

namespace App\Module\Payment\Domain\ValueObject;

final class PaymentStatus
{
    public const PENDING  = 'pending';   // PaymentIntent erstellt, Gast hat noch nicht bezahlt
    public const PAID     = 'paid';      // Zahlung erfolgreich
    public const FAILED   = 'failed';    // Zahlung fehlgeschlagen
    public const REFUNDED = 'refunded';  // Rückerstattung erfolgt

    private function __construct() {}
}