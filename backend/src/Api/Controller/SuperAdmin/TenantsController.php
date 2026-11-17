<?php

declare(strict_types=1);

namespace App\Api\Controller\SuperAdmin;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\User\Domain\Entity\User;
use App\Module\User\Infrastructure\Persistence\DoctrineUserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

#[Route('/superadmin/tenants')]
class TenantsController extends AbstractController
{
    public function __construct(
        private readonly DoctrineTenantRepository  $tenants,
        private readonly DoctrineUserRepository    $users,
        private readonly EntityManagerInterface    $em,
        private readonly UserPasswordHasherInterface $hasher,
    ) {}

    #[Route('', name: 'superadmin_tenant_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $name  = trim($data['name'] ?? '');
        $email = trim($data['adminEmail'] ?? '');
        $pass  = $data['adminPassword'] ?? '';

        if (!$name || !$email || !$pass) {
            return $this->json(['error' => 'Name, E-Mail und Passwort sind Pflichtfelder.'], 400);
        }

        // Slug aus Name generieren
        $slug = $data['slug'] ?? '';
        if (!$slug) {
            $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT', $name)));
            $slug = trim($slug, '-');
        }

        // Slug-Uniqueness sicherstellen
        $base = $slug;
        $i    = 1;
        while ($this->tenants->findBySlug($slug)) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        // Tenant anlegen
        $tenant = new Tenant($name, $slug);

        $plan = in_array($data['plan'] ?? '', ['tisch', 'menu', 'maitre'], true)
            ? $data['plan']
            : 'tisch';
        $tenant->upgradePlan($plan);

        $addons = array_values(array_filter((array) ($data['addons'] ?? []), 'is_string'));
        $tenant->setUiSettings(['addons' => $addons]);

        if (!empty($data['contactEmail']))   $tenant->setContactEmail($data['contactEmail']);
        if (!empty($data['contactPhone']))   $tenant->setContactPhone($data['contactPhone']);
        if (!empty($data['address']))        $tenant->setAddress($data['address']);
        if (!empty($data['billingAddress'])) $tenant->setBillingAddress($data['billingAddress']);
        if (!empty($data['internalNotes']))      $tenant->setInternalNotes($data['internalNotes']);
        if (!empty($data['contractDuration']))   $tenant->setContractDuration($data['contractDuration']);
        if (!empty($data['cancellationPeriod'])) $tenant->setCancellationPeriod($data['cancellationPeriod']);
        if (!empty($data['contractStart']))      $tenant->setContractStart(new \DateTimeImmutable($data['contractStart']));

        $this->tenants->save($tenant);

        // Admin-User anlegen
        if ($this->users->findByEmail($email) !== null) {
            $this->em->remove($tenant);
            $this->em->flush();
            return $this->json(['error' => "E-Mail '{$email}' ist bereits vergeben."], 422);
        }

        $user = new User($email, ['ROLE_TENANT_ADMIN']);
        $user->setPassword($this->hasher->hashPassword($user, $pass));
        $user->setTenant($tenant);
        $this->users->save($user);

        return $this->json($this->serialize($tenant), 201);
    }

    #[Route('', name: 'superadmin_tenants_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        $tenants = $this->tenants->findAll();

        return $this->json(array_map(
            fn(Tenant $t) => $this->serialize($t),
            $tenants,
        ));
    }

    #[Route('/{id}', name: 'superadmin_tenant_get', methods: ['GET'])]
    public function get(string $id): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

        return $this->json($this->serialize($tenant));
    }

    #[Route('/{id}/plan', name: 'superadmin_tenant_plan', methods: ['PATCH'])]
    public function updatePlan(string $id, Request $request): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

        $data = json_decode($request->getContent(), true);
        $plan = $data['plan'] ?? null;

        if (!in_array($plan, ['tisch', 'menu', 'maitre'], true)) {
            return $this->json(['error' => 'Invalid plan'], 400);
        }

        $tenant->upgradePlan($plan);
        $this->tenants->save($tenant);

        return $this->json($this->serialize($tenant));
    }

    #[Route('/{id}/addon', name: 'superadmin_tenant_addon', methods: ['PATCH'])]
    public function updateAddon(string $id, Request $request): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

        $data   = json_decode($request->getContent(), true);
        $key    = $data['key'] ?? null;
        $active = (bool) ($data['active'] ?? false);

        $settings          = $tenant->getUiSettings() ?? [];
        $addons            = $settings['addons'] ?? [];
        $addons            = $active
            ? array_unique(array_merge($addons, [$key]))
            : array_values(array_filter($addons, fn($a) => $a !== $key));
        $settings['addons'] = $addons;

        $tenant->setUiSettings($settings);
        $this->tenants->save($tenant);

        return $this->json($this->serialize($tenant));
    }

    #[Route('/{id}/details', name: 'superadmin_tenant_details', methods: ['PATCH'])]
    public function updateDetails(string $id, Request $request): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

        $data = json_decode($request->getContent(), true);

        if (array_key_exists('name', $data))           $tenant->setName($data['name']);
        if (array_key_exists('contactEmail', $data))   $tenant->setContactEmail($data['contactEmail'] ?: null);
        if (array_key_exists('contactPhone', $data))   $tenant->setContactPhone($data['contactPhone'] ?: null);
        if (array_key_exists('address', $data))        $tenant->setAddress($data['address'] ?: null);
        if (array_key_exists('billingAddress', $data)) $tenant->setBillingAddress($data['billingAddress'] ?: null);
        if (array_key_exists('internalNotes', $data))      $tenant->setInternalNotes($data['internalNotes'] ?: null);
        if (array_key_exists('contractDuration', $data))   $tenant->setContractDuration($data['contractDuration'] ?: null);
        if (array_key_exists('cancellationPeriod', $data)) $tenant->setCancellationPeriod($data['cancellationPeriod'] ?: null);
        if (array_key_exists('contractStart', $data)) {
            $tenant->setContractStart(
                $data['contractStart'] ? new \DateTimeImmutable($data['contractStart']) : null
            );
        }

        $this->tenants->save($tenant);

        return $this->json($this->serialize($tenant));
    }

    #[Route('/{id}/reset-password', name: 'superadmin_tenant_reset_password', methods: ['POST'])]
    public function resetPassword(string $id): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

        $candidates = $this->users->findBy(['tenant' => $tenant]);
        $adminUser  = null;
        foreach ($candidates as $u) {
            if (in_array('ROLE_TENANT_ADMIN', $u->getRoles(), true)
                && !in_array('ROLE_PLATFORM_ADMIN', $u->getRoles(), true)) {
                $adminUser = $u;
                break;
            }
        }

        if (!$adminUser) {
            return $this->json(['error' => 'Kein Tenant-Admin-User gefunden.'], 404);
        }

        $plain = $this->generatePassword();
        $adminUser->setPassword($this->hasher->hashPassword($adminUser, $plain));
        $this->users->save($adminUser);

        return $this->json([
            'email'    => $adminUser->getEmail(),
            'password' => $plain,
        ]);
    }

    private function generatePassword(): string
    {
        $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
        $pw = '';
        for ($i = 0; $i < 12; $i++) {
            $pw .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $pw;
    }

    #[Route('/{id}/status', name: 'superadmin_tenant_status', methods: ['PATCH'])]
    public function updateStatus(string $id, Request $request): JsonResponse
    {
        $tenant = $this->tenants->findById(Uuid::fromString($id));
        if (!$tenant) {
            return $this->json(['error' => 'Not found'], 404);
        }

        $data = json_decode($request->getContent(), true);
        $active = (bool) ($data['active'] ?? true);

        $active ? $tenant->activate() : $tenant->suspend();
        $this->tenants->save($tenant);

        return $this->json($this->serialize($tenant));
    }

    private function serialize(Tenant $t): array
    {
        $settings = $t->getUiSettings() ?? [];
        $addons   = $settings['addons'] ?? [];

        $adminUser = $this->users->findOneBy(['tenant' => $t]);

        return [
            'id'             => $t->getId(),
            'name'           => $t->getName(),
            'slug'           => $t->getSlug(),
            'plan'           => $t->getPlan(),
            'active'         => $t->isActive(),
            'addons'         => $addons,
            'createdAt'      => $t->getCreatedAt()->format('Y-m-d'),
            'adminEmail'     => $adminUser?->getEmail(),
            'contactEmail'       => $t->getContactEmail(),
            'contactPhone'       => $t->getContactPhone(),
            'address'            => $t->getAddress(),
            'billingAddress'     => $t->getBillingAddress(),
            'internalNotes'      => $t->getInternalNotes(),
            'contractDuration'   => $t->getContractDuration(),
            'cancellationPeriod' => $t->getCancellationPeriod(),
            'contractStart'      => $t->getContractStart()?->format('Y-m-d'),
        ];
    }
}