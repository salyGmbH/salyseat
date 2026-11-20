<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Infrastructure\ThreeSixtyDialog;

use App\Module\WhatsApp\Domain\Gateway\WhatsAppWebhookVerifierInterface;
use Symfony\Component\HttpFoundation\Request;

/**
 * VORLÄUFIGE Implementierung — 360dialogs genaues Signatur-/Auth-Verfahren
 * für eingehende Webhooks war zum Zeitpunkt der Implementierung öffentlich
 * nicht dokumentiert (siehe Plan, Abschnitt "Uncertainty flags"). Statt eine
 * falsche HMAC-Prüfung zu raten, wird hier ein selbst vergebenes Shared
 * Secret als Query-Parameter geprüft — die Webhook-URL wird bei 360dialog
 * mit genau diesem Secret registriert (`POST /v1/configs/webhook {"url":
 * ".../webhook/whatsapp?secret=..."}`), sodass ein Angreifer ohne Kenntnis
 * der URL keine gültigen Events einspielen kann.
 *
 * VOR PRODUKTIV-ROLLOUT eines echten Tenants: gegen die aktuelle
 * 360dialog-Doku/den Support verifizieren, ob es ein eigenes
 * Signatur-Verfahren gibt, und diese Klasse entsprechend ersetzen/härten.
 */
final class ThreeSixtyDialogWebhookVerifier implements WhatsAppWebhookVerifierInterface
{
    public function __construct(
        private readonly string $sharedSecret,
    ) {}

    public function verify(Request $request): bool
    {
        if ($this->sharedSecret === '' || $this->sharedSecret === 'changeme-generate-a-real-secret') {
            return false;
        }

        $provided = $request->query->get('secret') ?? $request->headers->get('X-Webhook-Secret', '');

        return hash_equals($this->sharedSecret, (string) $provided);
    }
}
