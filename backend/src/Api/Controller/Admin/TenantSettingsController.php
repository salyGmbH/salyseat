<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Staff\Infrastructure\Persistence\DoctrineStaffRepository;
use App\Module\Tenant\Domain\Repository\AddOnRepositoryInterface;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/tenant/settings')]
class TenantSettingsController extends AbstractController
{
    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
        private readonly DoctrineStaffRepository  $staff,
        private readonly AddOnRepositoryInterface $addons,
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

        // Die Berechtigungs-Matrix (Rechte-Seite) ist Teil desselben generischen
        // Settings-Objekts, das jede Einstellungsseite komplett mit-sendet — daher
        // reicht ein Prüfen auf "kommt 'permissions' im Payload vor" nicht, das
        // wäre bei jedem Speichern der Fall. Es zählt nur, ob sich der Wert
        // tatsächlich ändert.
        $existing            = $tenant->getUiSettings() ?? [];
        $incomingPermissions = $data['permissions'] ?? null;
        $existingPermissions = $existing['permissions'] ?? null;

        // actingEmployeeNumber ist nur Autorisierungs-Metadaten, kein Settings-Wert.
        $actingEmployeeNumber = (int) ($data['actingEmployeeNumber'] ?? 0);
        unset($data['actingEmployeeNumber']);

        if ($incomingPermissions !== null
            && json_encode($incomingPermissions) !== json_encode($existingPermissions)
        ) {
            $staff = $actingEmployeeNumber > 0
                ? $this->staff->findActiveByTenantAndNumber($tenant, $actingEmployeeNumber)
                : null;

            if ($staff === null || $staff->getRole() !== 'admin') {
                return $this->json(
                    ['error' => 'Nur Mitarbeiter mit der Rolle Admin dürfen Berechtigungen ändern.'],
                    Response::HTTP_FORBIDDEN,
                );
            }
        }

        // Top-Level-Merge statt Ersetzen: jede Einstellungsseite lädt beim Öffnen
        // ihren eigenen Snapshot und sendet ihn beim Speichern komplett wieder mit.
        // Bleibt eine Seite länger offen (z.B. ein Tab im Hintergrund) während auf
        // einer anderen Seite zwischenzeitlich gespeichert wird, wäre ihr Snapshot
        // veraltet — ein reines "Ersetzen" hätte dann die zwischenzeitlich
        // gespeicherten Top-Level-Keys (z.B. widgetDesign, speisekarteKonfiguration)
        // wieder gelöscht. Ein Merge macht das unabhängig vom Snapshot-Alter sicher.
        $tenant->setUiSettings([...$existing, ...$data]);
        $this->tenants->save($tenant);

        return $this->json($tenant->getUiSettings());
    }

    private const PLAN_RANK = ['tisch' => 1, 'menu' => 2, 'maitre' => 3];

    #[Route('/addon/{key}', name: 'admin_tenant_addon_patch', methods: ['PATCH'])]
    public function updateAddon(#[CurrentUser] User $user, string $key, Request $request): JsonResponse
    {
        $addOn = $this->addons->findByKey($key);
        if ($addOn === null) {
            return $this->json(['error' => 'Unknown addon'], 400);
        }

        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'No tenant'], 400);
        }

        $data   = json_decode($request->getContent(), true);
        $active = (bool) ($data['active'] ?? false);

        $minPlan = $addOn->getMinPlan();
        if ($active && $minPlan !== null && self::PLAN_RANK[$tenant->getPlan()] < self::PLAN_RANK[$minPlan]) {
            return $this->json(['error' => sprintf('Dieses Add-on ist erst ab dem Plan "%s" buchbar.', $minPlan)], 400);
        }

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
