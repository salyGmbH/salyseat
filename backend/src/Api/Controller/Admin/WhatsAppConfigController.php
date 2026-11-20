<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\User\Domain\Entity\User;
use App\Module\WhatsApp\Application\WhatsAppConnectorFactory;
use App\Module\WhatsApp\Infrastructure\ThreeSixtyDialog\ThreeSixtyDialogClient;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Tenant-seitige Verwaltung der WhatsApp-Anbindung (360dialog) — analog zu
 * PmsGuestController für die PMS-Anbindung. Voraussetzung ist das Add-on
 * "whatsapp"; die Freischaltung selbst passiert über den Add-on-Katalog,
 * nicht hier.
 */
#[Route('/whatsapp')]
class WhatsAppConfigController extends AbstractController
{
    public function __construct(
        private readonly WhatsAppConnectorFactory $factory,
        private readonly DoctrineTenantRepository $tenants,
        private readonly LoggerInterface $logger,
    ) {}

    /** Status anhand der gespeicherten Konfiguration — inkl. echtem Live-Check gegen 360dialog. */
    #[Route('/status', name: 'admin_whatsapp_status', methods: ['GET'])]
    public function status(#[CurrentUser] User $user): JsonResponse
    {
        $tenant  = $user->getTenant();
        $gateway = $this->factory->forTenant($tenant);

        return $this->json([
            'connected'     => $gateway !== null && $gateway->testConnection(),
            'phoneNumberId' => $tenant->getWhatsappPhoneNumberId(),
        ]);
    }

    /**
     * Testet die im Formular AKTUELL EINGETRAGENEN (noch nicht zwingend
     * gespeicherten) Zugangsdaten live gegen 360dialog — unabhängig vom
     * gespeicherten Stand in der DB.
     */
    #[Route('/test', name: 'admin_whatsapp_test', methods: ['POST'])]
    public function test(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        $apiKey = (string) ($data['apiKey'] ?? '');
        // Maskierten Wert (falls das Formular ihn ungeändert zurückschickt) durch
        // den tatsächlich gespeicherten Key ersetzen.
        if (str_contains($apiKey, '*')) {
            $apiKey = $user->getTenant()->getWhatsappConfig()['api_key'] ?? '';
        }

        if ($apiKey === '') {
            return $this->json(['connected' => false]);
        }

        $gateway = new ThreeSixtyDialogClient(
            apiKey:  $apiKey,
            baseUrl: (string) ($data['baseUrl'] ?? '') ?: 'https://waba-sandbox.360dialog.io',
            enabled: true,
            logger:  $this->logger,
        );

        return $this->json(['connected' => $gateway->testConnection()]);
    }

    #[Route('/config', name: 'admin_whatsapp_config_get', methods: ['GET'])]
    public function getConfig(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        $config = $tenant->getWhatsappConfig() ?? [];

        $masked = $config;
        if (!empty($masked['api_key']) && strlen($masked['api_key']) > 6) {
            $masked['api_key'] = str_repeat('*', strlen($masked['api_key']) - 6) . substr($masked['api_key'], -6);
        }

        return $this->json([
            'phoneNumberId' => $tenant->getWhatsappPhoneNumberId(),
            'channelId'     => $tenant->getWhatsappChannelId(),
            'apiKey'        => $masked['api_key'] ?? '',
            'baseUrl'       => $masked['base_url'] ?? '',
        ]);
    }

    #[Route('/config', name: 'admin_whatsapp_config_put', methods: ['PUT'])]
    public function putConfig(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON'], 400);
        }

        $tenant   = $user->getTenant();
        $existing = $tenant->getWhatsappConfig() ?? [];

        $apiKey = (string) ($data['apiKey'] ?? '');
        if (str_contains($apiKey, '*')) {
            // Maskierten Wert nicht überschreiben
            $apiKey = $existing['api_key'] ?? '';
        }

        $tenant->setWhatsappPhoneNumberId(($data['phoneNumberId'] ?? '') !== '' ? (string) $data['phoneNumberId'] : null);
        $tenant->setWhatsappChannelId(($data['channelId'] ?? '') !== '' ? (string) $data['channelId'] : null);
        $tenant->setWhatsappConfig($apiKey === '' ? null : [
            'api_key'  => $apiKey,
            'base_url' => (string) ($data['baseUrl'] ?? ''),
        ]);

        $this->tenants->save($tenant);

        return $this->json(['saved' => true]);
    }
}