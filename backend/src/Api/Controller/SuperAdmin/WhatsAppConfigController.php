<?php

declare(strict_types=1);

namespace App\Api\Controller\SuperAdmin;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Zentrale (Superadmin-seitige) Verwaltung der WhatsApp-Zugangsdaten eines
 * Tenants — additiv zur bestehenden, tenant-seitigen Selbstverwaltung
 * (Api/Controller/Admin/WhatsAppConfigController). Beide Wege schreiben in
 * dieselben Tenant-Felder (whatsappPhoneNumberId/-ChannelId/-Config); welcher
 * Weg im Live-Betrieb tatsächlich genutzt wird (Restaurant selbst vs.
 * zentral über einen 360dialog-Partner-Account), ist noch nicht entschieden
 * — siehe Hinweis im Frontend.
 */
#[Route('/superadmin/tenants/{id}/whatsapp')]
class WhatsAppConfigController extends AbstractController
{
    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
    ) {}

    #[Route('', name: 'superadmin_whatsapp_config_get', methods: ['GET'])]
    public function getConfig(string $id): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

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

    #[Route('', name: 'superadmin_whatsapp_config_put', methods: ['PUT'])]
    public function putConfig(string $id, Request $request): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON'], 400);
        }

        $existing = $tenant->getWhatsappConfig() ?? [];

        $apiKey = (string) ($data['apiKey'] ?? '');
        if (str_contains($apiKey, '*')) {
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