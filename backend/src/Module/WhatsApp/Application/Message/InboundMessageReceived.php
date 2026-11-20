<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\Message;

final readonly class InboundMessageReceived
{
    public function __construct(
        public string $tenantId,
        public ?string $waMessageId,
        public string $fromPhone,
        public ?string $waProfileName,
        public string $textBody,
    ) {}
}
