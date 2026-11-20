<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\Message;

final readonly class SendWhatsAppMessage
{
    public function __construct(
        public string $tenantId,
        public string $toPhone,
        public string $body,
        public ?string $conversationId = null,
    ) {}
}