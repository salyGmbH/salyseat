<?php

declare(strict_types=1);

namespace App\Api\Controller\Webhook;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\WhatsApp\Application\Message\InboundMessageReceived;
use App\Module\WhatsApp\Domain\Gateway\WhatsAppWebhookVerifierInterface;
use App\Module\WhatsApp\Infrastructure\ThreeSixtyDialog\ThreeSixtyDialogPayloadMapper;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

/**
 * POST /api/v1/webhook/whatsapp
 *
 * Empfängt eingehende WhatsApp-Nachrichten über 360dialog, verifiziert den
 * Request (siehe WhatsAppWebhookVerifierInterface — Verfahren vorläufig,
 * siehe Plan) und queued jede Nachricht asynchron zur Verarbeitung. Antwortet
 * bewusst immer schnell mit 200, damit der Absender keine unnötigen Retries
 * auslöst — die eigentliche Verarbeitung läuft im Messenger-Worker.
 *
 * Öffentlich — gesichert durch die Webhook-Verifizierung, nicht durch JWT
 * (siehe access_control-Eintrag in security.yaml, analog zu /webhook/stripe).
 */
#[Route('/api/v1/webhook/whatsapp', name: 'webhook_whatsapp', methods: ['POST'])]
class WhatsAppWebhookController extends AbstractController
{
    public function __construct(
        private readonly WhatsAppWebhookVerifierInterface $verifier,
        private readonly ThreeSixtyDialogPayloadMapper $payloadMapper,
        private readonly DoctrineTenantRepository $tenants,
        private readonly MessageBusInterface $bus,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        if (!$this->verifier->verify($request)) {
            $this->logger->warning('WhatsApp-Webhook: Verifizierung fehlgeschlagen');
            return $this->json(['error' => 'Verifizierung fehlgeschlagen.'], Response::HTTP_BAD_REQUEST);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['received' => true]);
        }

        $phoneNumberId = $this->payloadMapper->extractPhoneNumberId($payload);
        $tenant = $phoneNumberId !== null ? $this->tenants->findByWhatsappPhoneNumberId($phoneNumberId) : null;

        if ($tenant === null) {
            $this->logger->warning('WhatsApp-Webhook: kein Tenant für phone_number_id gefunden', [
                'phone_number_id' => $phoneNumberId,
            ]);
            // Immer 200 — ein unbekannter/falsch konfigurierter Kanal soll keine
            // Retry-Kaskade beim Absender auslösen.
            return $this->json(['received' => true]);
        }

        if (!in_array('whatsapp', $tenant->getUiSettings()['addons'] ?? [], true)) {
            // Addon nicht aktiv — bewusst still, kein Verarbeitungsschritt.
            return $this->json(['received' => true]);
        }

        foreach ($this->payloadMapper->extractMessages($payload) as $m) {
            if ($m['text'] === '') {
                continue; // v1 verarbeitet nur Text-Nachrichten
            }

            $this->bus->dispatch(new InboundMessageReceived(
                tenantId:      $tenant->getId()->toRfc4122(),
                waMessageId:   $m['waMessageId'],
                fromPhone:     $m['from'],
                waProfileName: $m['waProfileName'],
                textBody:      $m['text'],
            ));
        }

        return $this->json(['received' => true]);
    }
}