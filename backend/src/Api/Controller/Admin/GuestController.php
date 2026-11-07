<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Reservation\Application\Query\ListGuests\ListGuestsHandler;
use App\Module\Reservation\Application\Query\ListGuests\ListGuestsQuery;
use App\Module\Reservation\Infrastructure\Persistence\DoctrineGuestRepository;
use App\Module\User\Domain\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/guests')]
class GuestController extends AbstractController
{
    public function __construct(
        private readonly ListGuestsHandler      $listHandler,
        private readonly DoctrineGuestRepository $repo,
        private readonly EntityManagerInterface  $em,
    ) {}

    #[Route('', name: 'admin_guest_list', methods: ['GET'])]
    public function list(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['guests' => [], 'total' => 0, 'limit' => 100, 'offset' => 0]);
        }

        $search = $request->query->get('search');
        $limit  = max(1, min(500, (int) $request->query->get('limit', 100)));
        $offset = max(0, (int) $request->query->get('offset', 0));

        return $this->json(
            ($this->listHandler)(new ListGuestsQuery(
                tenantId: $tenant->getId()->toRfc4122(),
                search:   $search !== '' ? $search : null,
                limit:    $limit,
                offset:   $offset,
            ))
        );
    }

    #[Route('/{id}', name: 'admin_guest_update', methods: ['PATCH'])]
    public function update(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $uuid = Uuid::fromString($id);
        } catch (\Throwable) {
            return $this->json(['error' => 'Ungültige ID.'], Response::HTTP_BAD_REQUEST);
        }

        $guest = $this->repo->findById($uuid);
        if ($guest === null || $guest->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return $this->json(['error' => 'Gast nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (isset($data['name']) && trim((string) $data['name']) !== '') {
            $guest->setName(trim((string) $data['name']));
        }
        if (array_key_exists('phone', $data)) {
            $guest->setPhone($data['phone'] !== '' ? (string) $data['phone'] : null);
        }
        if (array_key_exists('internal_notes', $data)) {
            $guest->setInternalNotes($data['internal_notes'] !== '' ? (string) $data['internal_notes'] : null);
        }
        if (isset($data['blocked'])) {
            if ((bool) $data['blocked']) {
                $guest->block((string) ($data['blocked_reason'] ?? ''));
            } else {
                $guest->unblock();
            }
        }
        if (array_key_exists('gasttypen', $data) && is_array($data['gasttypen'])) {
            $guest->setGasttypen(array_filter($data['gasttypen'], 'is_string'));
        }
        if (array_key_exists('hinweise', $data) && is_array($data['hinweise'])) {
            $guest->setHinweise(array_filter($data['hinweise'], 'is_string'));
        }

        $this->em->flush();

        return $this->json($this->serialize($guest));
    }

    private function serialize(\App\Module\Reservation\Domain\Entity\Guest $g): array
    {
        return [
            'id'                  => $g->getId()->toRfc4122(),
            'name'                => $g->getName(),
            'email'               => $g->getEmail(),
            'phone'               => $g->getPhone(),
            'internal_notes'      => $g->getInternalNotes(),
            'blocked'             => $g->isBlocked(),
            'blocked_reason'      => $g->getBlockedReason(),
            'gasttypen'           => $g->getGasttypen(),
            'hinweise'            => $g->getHinweise(),
            'total_reservations'  => $g->getTotalReservations(),
            'no_show_count'       => $g->getNoShowCount(),
            'reliability_score'   => $g->getReliabilityScore(),
            'created_at'          => $g->getCreatedAt()->format('Y-m-d'),
        ];
    }
}
