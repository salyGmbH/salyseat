<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Gateway;

interface WhatsAppGatewayInterface
{
    public function isEnabled(): bool;

    /** Sendet eine Freitext-Nachricht und gibt die Provider-Message-ID zurück. */
    public function sendTextMessage(string $toPhone, string $body): string;

    /**
     * Prüft die Zugangsdaten live gegen die 360dialog-API, ohne eine echte
     * Nachricht zu versenden (ruft die Webhook-Konfiguration ab — erfordert
     * einen gültigen API-Key, hat aber keine Nebenwirkungen).
     */
    public function testConnection(): bool;
}