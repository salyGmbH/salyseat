<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\User\Domain\Entity\User;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/venues')]
class VenueController extends AbstractController
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    /** GET /api/v1/admin/venues */
    #[Route('', name: 'admin_venue_list', methods: ['GET'])]
    public function list(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['venues' => []]);
        }

        $venues = $this->em->getRepository(Venue::class)->findBy(
            ['tenant' => $tenant],
            ['createdAt' => 'ASC'],
        );

        return $this->json(['venues' => array_map($this->serialize(...), $venues)]);
    }

    /** POST /api/v1/admin/venues */
    #[Route('', name: 'admin_venue_create', methods: ['POST'])]
    public function create(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string) ($data['name'] ?? ''));
        $category = trim((string) ($data['category'] ?? 'restaurant'));

        if ($name === '') {
            return $this->json(['error' => 'Name ist erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $venue = new Venue($tenant, $name, $category);
        $this->applyFields($venue, $data);

        $this->em->persist($venue);
        $this->em->flush();

        return $this->json($this->serialize($venue), Response::HTTP_CREATED);
    }

    /** GET /api/v1/admin/venues/{id} */
    #[Route('/{id}', name: 'admin_venue_get', methods: ['GET'])]
    public function get(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->findForUser($id, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serialize($venue));
    }

    /** PATCH /api/v1/admin/venues/{id} */
    #[Route('/{id}', name: 'admin_venue_update', methods: ['PATCH'])]
    public function update(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->findForUser($id, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $this->applyFields($venue, $data);
        $this->em->flush();

        return $this->json($this->serialize($venue));
    }

    /** DELETE /api/v1/admin/venues/{id} */
    #[Route('/{id}', name: 'admin_venue_delete', methods: ['DELETE'])]
    public function delete(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->findForUser($id, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->em->remove($venue);
        $this->em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /** GET /api/v1/admin/venues/{id}/layout */
    #[Route('/{id}/layout', name: 'admin_venue_layout_get', methods: ['GET'])]
    public function getLayout(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->findForUser($id, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json(['layout' => $venue->getLayout()]);
    }

    /** PUT /api/v1/admin/venues/{id}/layout */
    #[Route('/{id}/layout', name: 'admin_venue_layout_save', methods: ['PUT'])]
    public function saveLayout(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $venue = $this->findForUser($id, $user);
        if ($venue === null) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $venue->setLayout($data['layout'] ?? null);
        $this->em->flush();

        return $this->json(['layout' => $venue->getLayout()]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function findForUser(string $id, User $user): ?Venue
    {
        $venue = $this->em->getRepository(Venue::class)->find($id);
        if ($venue === null) {
            return null;
        }
        // Super-Admins dürfen alles, Tenant-Admins nur ihren eigenen Tenant
        if (!$user->isSuperAdmin() && $venue->getTenant() !== $user->getTenant()) {
            return null;
        }
        return $venue;
    }

    private function applyFields(Venue $venue, array $data): void
    {
        if (isset($data['name'])) {
            $venue->setName(trim((string) $data['name']));
        }
        if (isset($data['category'])) {
            $venue->setCategory(trim((string) $data['category']));
        }
        if (array_key_exists('description', $data)) {
            $venue->setDescription($data['description'] !== '' ? (string) $data['description'] : null);
        }
        if (array_key_exists('address', $data)) {
            $venue->setAddress($data['address'] !== '' ? (string) $data['address'] : null);
        }
        if (array_key_exists('phone', $data)) {
            $venue->setPhone($data['phone'] !== '' ? (string) $data['phone'] : null);
        }
        if (array_key_exists('email', $data)) {
            $venue->setEmail($data['email'] !== '' ? (string) $data['email'] : null);
        }
        if (array_key_exists('timezone', $data)) {
            $venue->setTimezone((string) $data['timezone']);
        }
        if (isset($data['defaultDurationMinutes'], $data['maxAdvanceBookingDays'], $data['minAdvanceBookingHours'])) {
            $venue->updateBookingSettings(
                (int) $data['defaultDurationMinutes'],
                (int) $data['maxAdvanceBookingDays'],
                (int) $data['minAdvanceBookingHours'],
            );
        }
    }

    private function serialize(Venue $venue): array
    {
        return [
            'id'                     => $venue->getId()->toRfc4122(),
            'name'                   => $venue->getName(),
            'category'               => $venue->getCategory(),
            'description'            => $venue->getDescription(),
            'address'                => $venue->getAddress(),
            'phone'                  => $venue->getPhone(),
            'email'                  => $venue->getEmail(),
            'timezone'               => $venue->getTimezone(),
            'defaultDurationMinutes' => $venue->getDefaultDurationMinutes(),
            'maxAdvanceBookingDays'  => $venue->getMaxAdvanceBookingDays(),
            'minAdvanceBookingHours' => $venue->getMinAdvanceBookingHours(),
            'active'                 => $venue->isActive(),
            'resourceCount'          => $venue->getResources()->count(),
        ];
    }
}