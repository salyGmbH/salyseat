<?php

declare(strict_types=1);

namespace App\Messenger\Message;

final readonly class SendVoucherEmail
{
    public function __construct(
        public string $voucherId,
        public string $code,
        public float  $amount,
        public string $recipientName,
        public string $recipientEmail,
        public string $buyerName,
        public string $expiresAt,
        public string $venueName,
        public string $tenantId,
        public ?string $message = null,
    ) {}
}