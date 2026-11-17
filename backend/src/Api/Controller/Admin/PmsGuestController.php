<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Pms\Application\PmsConnectorFactory;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/pms')]
class PmsGuestController extends AbstractController
{
    public function __construct(
        private readonly PmsConnectorFactory $factory,
        private readonly DoctrineTenantRepository $tenants,
    ) {}

    #[Route('/status', name: 'admin_pms_status', methods: ['GET'])]
    public function status(#[CurrentUser] User $user): JsonResponse
    {
        $pms = $this->factory->forTenant($user->getTenant());
        return $this->json(['enabled' => $pms !== null && $pms->isEnabled()]);
    }

    #[Route('/config', name: 'admin_pms_config_get', methods: ['GET'])]
    public function getConfig(#[CurrentUser] User $user): JsonResponse
    {
        $config = $user->getTenant()->getPmsConfig() ?? [];

        $masked = $config;
        foreach (['clientToken', 'accessToken'] as $key) {
            if (!empty($masked[$key]) && strlen($masked[$key]) > 6) {
                $masked[$key] = str_repeat('*', strlen($masked[$key]) - 6) . substr($masked[$key], -6);
            }
        }

        return $this->json($masked);
    }

    #[Route('/config', name: 'admin_pms_config_put', methods: ['PUT'])]
    public function putConfig(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON'], 400);
        }

        $tenant   = $user->getTenant();
        $existing = $tenant->getPmsConfig() ?? [];

        // Maskierte Werte (mit *) nicht überschreiben
        foreach (['clientToken', 'accessToken'] as $key) {
            if (isset($data[$key]) && str_contains($data[$key], '*')) {
                $data[$key] = $existing[$key] ?? '';
            }
        }

        $allowed = ['provider', 'clientToken', 'accessToken', 'serviceId', 'resourceCategoryId', 'rateId', 'ageCategoryId', 'baseUrl'];
        $config  = array_intersect_key($data, array_flip($allowed));

        $tenant->setPmsConfig(empty($config['provider']) ? null : $config);
        $this->tenants->save($tenant);

        return $this->json(['saved' => true]);
    }

    #[Route('/guests/search', name: 'admin_pms_guests_search', methods: ['GET'])]
    public function search(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $pms = $this->factory->forTenant($user->getTenant());
        if ($pms === null || !$pms->isEnabled()) {
            return $this->json(['guests' => [], 'enabled' => false]);
        }

        $query = trim((string) $request->query->get('q', ''));
        if (strlen($query) < 2) {
            return $this->json(['guests' => []]);
        }

        try {
            return $this->json(['guests' => $pms->searchGuests($query)]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }

    #[Route('/guests/inhouse', name: 'admin_pms_guests_inhouse', methods: ['GET'])]
    public function inHouse(#[CurrentUser] User $user): JsonResponse
    {
        $pms = $this->factory->forTenant($user->getTenant());
        if ($pms === null || !$pms->isEnabled()) {
            return $this->json(['guests' => [], 'enabled' => false]);
        }

        try {
            return $this->json(['guests' => $pms->getInHouseGuests()]);
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }
}