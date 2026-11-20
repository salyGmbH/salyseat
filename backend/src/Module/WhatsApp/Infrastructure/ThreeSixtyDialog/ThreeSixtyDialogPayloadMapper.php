<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Infrastructure\ThreeSixtyDialog;

/**
 * Extrahiert Kanal-Identifikatoren und normalisierte Nachrichten aus dem
 * eingehenden Webhook-Payload. Zielformat ist das von 360dialog für
 * Produktiv-Kanäle verwendete Meta-Cloud-API-Envelope
 * (entry[].changes[].value...) — bestätigt gegen die 360dialog-Doku
 * (docs.360dialog.com/docs/messaging/webhook/webhook-reference). Die
 * Sandbox nutzt ein flacheres Format ({"contacts":[...],"messages":[...]})
 * nur zum frühen Entwickeln, siehe Plan.
 */
final class ThreeSixtyDialogPayloadMapper
{
    public function extractPhoneNumberId(array $payload): ?string
    {
        return $payload['entry'][0]['changes'][0]['value']['metadata']['phone_number_id']
            ?? null;
    }

    /**
     * @return array<int, array{waMessageId: ?string, from: string, waProfileName: ?string, text: string, type: string}>
     */
    public function extractMessages(array $payload): array
    {
        $value = $payload['entry'][0]['changes'][0]['value'] ?? $payload;

        $namesByWaId = [];
        foreach ($value['contacts'] ?? [] as $contact) {
            $waId = $contact['wa_id'] ?? null;
            if ($waId !== null) {
                $namesByWaId[$waId] = $contact['profile']['name'] ?? null;
            }
        }

        $out = [];
        foreach ($value['messages'] ?? [] as $message) {
            $from = (string) ($message['from'] ?? '');
            if ($from === '') {
                continue;
            }
            $out[] = [
                'waMessageId'   => $message['id'] ?? null,
                'from'          => $from,
                'waProfileName' => $namesByWaId[$from] ?? null,
                'text'          => (string) ($message['text']['body'] ?? ''),
                'type'          => (string) ($message['type'] ?? 'unknown'),
            ];
        }

        return $out;
    }
}