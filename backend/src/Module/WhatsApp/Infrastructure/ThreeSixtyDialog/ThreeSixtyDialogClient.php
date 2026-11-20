<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Infrastructure\ThreeSixtyDialog;

use App\Module\WhatsApp\Domain\Gateway\WhatsAppGatewayInterface;
use Psr\Log\LoggerInterface;

/**
 * Sendet Nachrichten über die 360dialog-API (Sandbox oder Produktiv, je nach
 * $baseUrl). Auth über den D360-API-KEY-Header — bestätigt gegen die
 * 360dialog-Sandbox-Doku (https://docs.360dialog.com/docs/get-started/sandbox).
 *
 * UNSICHER (vor Produktiv-Rollout eines echten Tenants gegen die aktuelle
 * 360dialog-Doku/den Support verifizieren): der genaue Produktiv-Base-URL und
 * ob sich das Response-Format zwischen Sandbox und Produktiv unterscheidet.
 */
final class ThreeSixtyDialogClient implements WhatsAppGatewayInterface
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
        private readonly bool $enabled,
        private readonly LoggerInterface $logger,
    ) {}

    public function isEnabled(): bool
    {
        return $this->enabled && $this->apiKey !== '';
    }

    public function sendTextMessage(string $toPhone, string $body): string
    {
        $response = $this->post('/v1/messages', [
            'messaging_product' => 'whatsapp',
            'to'                => $toPhone,
            'type'              => 'text',
            'text'              => ['body' => $body],
        ]);

        // Format gemäß Sandbox-Doku-Beispiel; im Live-Betrieb gegen die
        // tatsächliche Response verifizieren (siehe Klassen-Kommentar).
        return (string) ($response['messages'][0]['id'] ?? '');
    }

    public function testConnection(): bool
    {
        if (!$this->isEnabled()) {
            return false;
        }

        try {
            // Best-effort-Auswahl eines schreibfreien Endpunkts: die
            // Webhook-Konfiguration abrufen erfordert einen gültigen API-Key,
            // versendet aber keine Nachricht. UNSICHER — vor Produktiv-Rollout
            // gegen die aktuelle 360dialog-Doku verifizieren (siehe Klassen-Kommentar).
            $this->get('/v1/configs/webhook');
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function get(string $endpoint): array
    {
        return $this->request('GET', $endpoint, null);
    }

    private function post(string $endpoint, array $payload): array
    {
        return $this->request('POST', $endpoint, $payload);
    }

    private function request(string $method, string $endpoint, ?array $payload): array
    {
        $url = rtrim($this->baseUrl, '/') . $endpoint;

        $options = [
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'D360-API-KEY: ' . $this->apiKey,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
        ];

        if ($method === 'POST') {
            $options[CURLOPT_POST]       = true;
            $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_THROW_ON_ERROR);
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, $options);

        $raw    = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error  = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new \RuntimeException("360dialog cURL error: $error");
        }

        if ($status >= 400) {
            $this->logger->error('360dialog API Fehler', ['status' => $status, 'body' => $raw, 'endpoint' => $endpoint]);
            throw new \RuntimeException("360dialog API error HTTP $status: $raw");
        }

        return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?? [];
    }
}