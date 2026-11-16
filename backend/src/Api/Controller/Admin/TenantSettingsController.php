<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/tenant/settings')]
class TenantSettingsController extends AbstractController
{
    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
    ) {}

    #[Route('', name: 'admin_tenant_settings_get', methods: ['GET'])]
    public function get(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json([]);
        }

        $settings = $tenant->getUiSettings() ?? [];
        // Public Key immer mitliefern — wird im Admin für den Embed-Code benötigt.
        $settings['_publicKey'] = $tenant->getPublicKey();

        return $this->json($settings);
    }

    #[Route('', name: 'admin_tenant_settings_put', methods: ['PUT'])]
    public function put(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'No tenant'], 400);
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON'], 400);
        }

        $tenant->setUiSettings($data);
        $this->tenants->save($tenant);

        return $this->json($tenant->getUiSettings());
    }

    private const VALID_ADDONS = ['vouchers', 'pos'];

    #[Route('/addon/{key}', name: 'admin_tenant_addon_patch', methods: ['PATCH'])]
    public function updateAddon(#[CurrentUser] User $user, string $key, Request $request): JsonResponse
    {
        if (!in_array($key, self::VALID_ADDONS, true)) {
            return $this->json(['error' => 'Unknown addon'], 400);
        }

        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'No tenant'], 400);
        }

        $data   = json_decode($request->getContent(), true);
        $active = (bool) ($data['active'] ?? false);

        $settings          = $tenant->getUiSettings() ?? [];
        $addons            = $settings['addons'] ?? [];
        $addons            = $active
            ? array_unique(array_merge($addons, [$key]))
            : array_values(array_filter($addons, fn($a) => $a !== $key));
        $settings['addons'] = $addons;

        $tenant->setUiSettings($settings);
        $this->tenants->save($tenant);

        return $this->json(['addons' => $addons]);
    }

    #[Route('/plan', name: 'admin_tenant_plan_patch', methods: ['PATCH'])]
    public function updatePlan(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'No tenant'], 400);
        }

        $data = json_decode($request->getContent(), true);
        $plan = $data['plan'] ?? null;

        if (!in_array($plan, ['tisch', 'menu', 'maitre'], true)) {
            return $this->json(['error' => 'Invalid plan'], 400);
        }

        $tenant->upgradePlan($plan);
        $this->tenants->save($tenant);

        return $this->json(['plan' => $tenant->getPlan()]);
    }
}
