<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Gateway;

use Symfony\Component\HttpFoundation\Request;

interface WhatsAppWebhookVerifierInterface
{
    /** Prüft, ob ein eingehender Webhook-Request wirklich von 360dialog stammt. */
    public function verify(Request $request): bool;
}