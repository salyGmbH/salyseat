<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Staff\Domain\Entity\Staff;
use App\Module\Staff\Infrastructure\Persistence\DoctrineStaffRepository;
use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\User\Domain\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/staff')]
class StaffController extends AbstractController
{
    private const VALID_ROLES = ['admin', 'manager', 'staff'];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly DoctrineStaffRepository $repo,
    ) {}

    #[Route('', name: 'admin_staff_list', methods: ['GET'])]
    public function list(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
        }

        return $this->json(array_map($this->serialize(...), $this->repo->findByTenant($tenant)));
    }

    #[Route('/verify', name: 'admin_staff_verify', methods: ['POST'])]
    public function verify(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $number = (int) ($data['employeeNumber'] ?? 0);

        $staff = $number > 0 ? $this->repo->findActiveByTenantAndNumber($tenant, $number) : null;
        if ($staff === null) {
            return $this->json(['error' => 'Mitarbeiter-Nummer nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json([
            'id'   => $staff->getId()->toRfc4122(),
            'name' => $staff->getName(),
            'role' => $staff->getRole(),
        ]);
    }

    #[Route('', name: 'admin_staff_create', methods: ['POST'])]
    public function create(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
        }

        $authError = $this->assertActingAdmin($request, $tenant);
        if ($authError !== null) {
            return $authError;
        }

        $data  = json_decode($request->getContent(), true) ?? [];
        $name  = trim((string) ($data['name'] ?? ''));
        $email = isset($data['email']) && $data['email'] !== '' ? (string) $data['email'] : null;
        $role  = (string) ($data['role'] ?? 'staff');

        if ($name === '') {
            return $this->json(['error' => 'Name ist erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
        if (!in_array($role, self::VALID_ROLES, true)) {
            return $this->json(['error' => 'Ungültige Rolle.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $number = $this->repo->nextEmployeeNumber($tenant);
        $staff  = new Staff($tenant, $number, $name, $email, $role);

        $this->em->persist($staff);
        $this->em->flush();

        return $this->json($this->serialize($staff), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'admin_staff_update', methods: ['PATCH'])]
    public function update(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
        }

        $authError = $this->assertActingAdmin($request, $tenant);
        if ($authError !== null) {
            return $authError;
        }

        $staff = $this->resolveStaff($id, $user);
        if ($staff === null) {
            return $this->json(['error' => 'Mitarbeiter nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (isset($data['name']) && trim((string) $data['name']) !== '') {
            $staff->setName((string) $data['name']);
        }
        if (array_key_exists('email', $data)) {
            $staff->setEmail($data['email'] !== '' ? (string) $data['email'] : null);
        }
        if (isset($data['role']) && in_array($data['role'], self::VALID_ROLES, true)) {
            $staff->setRole((string) $data['role']);
        }
        if (isset($data['active'])) {
            $staff->setActive((bool) $data['active']);
        }

        $this->em->flush();

        return $this->json($this->serialize($staff));
    }

    #[Route('/{id}', name: 'admin_staff_delete', methods: ['DELETE'])]
    public function delete(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
        }

        $authError = $this->assertActingAdmin($request, $tenant);
        if ($authError !== null) {
            return $authError;
        }

        $staff = $this->resolveStaff($id, $user);
        if ($staff === null) {
            return $this->json(['error' => 'Mitarbeiter nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->em->remove($staff);
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    /**
     * Prüft die im Request mitgeschickte Mitarbeiter-Nummer (`actingEmployeeNumber`)
     * gegen den Staff-Datensatz des Tenants — nur Rolle 'admin' darf Mitarbeiter
     * anlegen/ändern/löschen. Bewusst keine ROLE_SUPER_ADMIN-Alternative mehr:
     * diese Prüfung ist die einzige Autorisierung für diese Endpoints.
     */
    private function assertActingAdmin(Request $request, Tenant $tenant): ?JsonResponse
    {
        $data   = json_decode($request->getContent(), true) ?? [];
        $number = (int) ($data['actingEmployeeNumber'] ?? 0);

        if ($number <= 0) {
            return $this->json(['error' => 'Mitarbeiter-ID erforderlich.'], Response::HTTP_FORBIDDEN);
        }

        $staff = $this->repo->findActiveByTenantAndNumber($tenant, $number);
        if ($staff === null || $staff->getRole() !== 'admin') {
            return $this->json(['error' => 'Nur Mitarbeiter mit der Rolle Admin dürfen das.'], Response::HTTP_FORBIDDEN);
        }

        return null;
    }

    private function resolveStaff(string $id, User $user): ?Staff
    {
        $tenant = $user->getTenant();
        if ($tenant === null) return null;

        try {
            $uuid = Uuid::fromString($id);
        } catch (\Throwable) {
            return null;
        }

        $staff = $this->repo->findById($uuid);
        if ($staff === null || $staff->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return null;
        }

        return $staff;
    }

    private function serialize(Staff $s): array
    {
        return [
            'id'              => $s->getId()->toRfc4122(),
            'employee_number' => $s->getEmployeeNumber(),
            'name'            => $s->getName(),
            'email'           => $s->getEmail(),
            'role'            => $s->getRole(),
            'active'          => $s->isActive(),
            'created_at'      => $s->getCreatedAt()->format('Y-m-d'),
        ];
    }
}
