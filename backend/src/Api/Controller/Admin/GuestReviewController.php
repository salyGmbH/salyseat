<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Review\Domain\Entity\GuestReview;
use App\Module\Review\Infrastructure\Persistence\DoctrineGuestReviewRepository;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/guest-reviews')]
class GuestReviewController extends AbstractController
{
    public function __construct(
        private readonly DoctrineGuestReviewRepository $repo,
    ) {}

    #[Route('', name: 'admin_guest_reviews_list', methods: ['GET'])]
    public function list(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        return $this->json(array_map(
            fn(GuestReview $r) => $this->serialize($r),
            $this->repo->findSubmittedByTenant($tenant),
        ));
    }

    #[Route('/unread-count', name: 'admin_guest_reviews_unread_count', methods: ['GET'])]
    public function unreadCount(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        return $this->json(['count' => $this->repo->countUnreadByTenant($tenant)]);
    }

    #[Route('/{id}/read', name: 'admin_guest_reviews_mark_read', methods: ['PATCH'])]
    public function markRead(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $review = $this->repo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($review === null) {
            return $this->json(['error' => 'Bewertung nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $review->markRead();
        $this->repo->save($review);

        return $this->json($this->serialize($review));
    }

    private function serialize(GuestReview $r): array
    {
        return [
            'id'             => $r->getId()->toRfc4122(),
            'guestName'      => $r->getGuestName(),
            'ratingService'  => $r->getRatingService(),
            'ratingFood'     => $r->getRatingFood(),
            'ratingAmbiance' => $r->getRatingAmbiance(),
            'ratingValue'    => $r->getRatingValue(),
            'comment'        => $r->getComment(),
            'submittedAt'    => $r->getSubmittedAt()?->format(\DateTimeInterface::ATOM),
            'read'           => $r->isRead(),
        ];
    }
}