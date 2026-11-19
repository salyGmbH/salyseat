<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Reservation\Domain\Entity\WaitlistEntry;
use App\Module\Reservation\Domain\Entity\WaitlistStatus;
use App\Module\Reservation\Infrastructure\Persistence\DoctrineWaitlistEntryRepository;
use App\Module\User\Domain\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/waitlist')]
class WaitlistController extends AbstractController
{
    public function __construct(
        private readonly DoctrineWaitlistEntryRepository $repo,
        private readonly EntityManagerInterface          $em,
    ) {}

    // ── Liste ─────────────────────────────────────────────────────────────────

    #[Route('', name: 'admin_waitlist_list', methods: ['GET'])]
    public function list(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['entries' => [], 'total' => 0, 'limit' => 100, 'offset' => 0]);
        }

        $status  = $request->query->get('status');
        $limit   = max(1, min(500, (int) $request->query->get('limit', 100)));
        $offset  = max(0, (int) $request->query->get('offset', 0));
        $venueId = null;
        $venueIdParam = $request->query->get('venue_id');
        if ($venueIdParam !== null && $venueIdParam !== '') {
            try {
                $venueId = Uuid::fromString($venueIdParam);
            } catch (\Throwable) {
                return $this->json(['error' => 'Ungültige venue_id.'], Response::HTTP_BAD_REQUEST);
            }
        }

        $tenantId = $tenant->getId();
        $entries  = $this->repo->listByTenant($tenantId, $status !== '' ? $status : null, $limit, $offset, $venueId);
        $total    = $this->repo->countByTenant($tenantId, $status !== '' ? $status : null, $venueId);

        return $this->json([
            'entries' => array_map([$this, 'serialize'], $entries),
            'total'   => $total,
            'limit'   => $limit,
            'offset'  => $offset,
        ]);
    }

    // ── Status ändern ────────────────────────────────────────────────────────

    #[Route('/{id}/status', name: 'admin_waitlist_status', methods: ['PATCH'])]
    public function updateStatus(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
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

        $entry = $this->repo->findById($uuid);
        if ($entry === null || $entry->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return $this->json(['error' => 'Warteliste-Eintrag nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $status = $data['status'] ?? null;

        $allowed = [WaitlistStatus::NOTIFIED, WaitlistStatus::CONVERTED, WaitlistStatus::CANCELLED];
        if (!in_array($status, $allowed, true)) {
            return $this->json(['error' => 'Ungültiger Status.'], Response::HTTP_BAD_REQUEST);
        }

        match ($status) {
            WaitlistStatus::NOTIFIED  => $entry->markNotified(),
            WaitlistStatus::CONVERTED => $entry->markConverted(),
            WaitlistStatus::CANCELLED => $entry->markCancelled(),
        };

        $this->em->flush();

        return $this->json(['ok' => true, 'entry' => $this->serialize($entry)]);
    }

    // ── Serializer ────────────────────────────────────────────────────────────

    private function serialize(WaitlistEntry $e): array
    {
        return [
            'id'           => $e->getId()->toRfc4122(),
            'status'       => $e->getStatus(),
            'venue_id'     => $e->getVenue()->getId()->toRfc4122(),
            'venue_name'   => $e->getVenue()->getName(),
            'guest_name'   => $e->getGuestName(),
            'guest_email'  => $e->getGuestEmail(),
            'guest_phone'  => $e->getGuestPhone(),
            'notes'        => $e->getNotes(),
            'party_size'   => $e->getPartySize(),
            'requested_at' => $e->getRequestedAt()->format(\DateTimeInterface::ATOM),
            'created_at'   => $e->getCreatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}