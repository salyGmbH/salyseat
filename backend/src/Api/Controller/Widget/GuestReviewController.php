<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Review\Infrastructure\Persistence\DoctrineGuestReviewRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/guest-reviews')]
class GuestReviewController extends AbstractController
{
    public function __construct(
        private readonly DoctrineGuestReviewRepository $repo,
    ) {}

    /**
     * GET /api/v1/widget/guest-reviews/{token}
     * Kontext für das Bewertungsformular — kein Auth nötig.
     */
    #[Route('/{token}', name: 'widget_guest_review_get', methods: ['GET'])]
    public function get(string $token): JsonResponse
    {
        $review = $this->repo->findByToken($token);

        if ($review === null) {
            return $this->json(['error' => 'Bewertungslink ungültig.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json([
            'venueName'       => $review->getTenant()->getName(),
            'guestName'       => $review->getGuestName(),
            'alreadySubmitted' => $review->isSubmitted(),
        ]);
    }

    /**
     * POST /api/v1/widget/guest-reviews/{token}
     * Formular-Submit — kein Auth nötig, Token ist einmalig gültig.
     */
    #[Route('/{token}', name: 'widget_guest_review_submit', methods: ['POST'])]
    public function submit(string $token, Request $request): JsonResponse
    {
        $review = $this->repo->findByToken($token);

        if ($review === null) {
            return $this->json(['error' => 'Bewertungslink ungültig.'], Response::HTTP_NOT_FOUND);
        }

        if ($review->isSubmitted()) {
            return $this->json(['error' => 'Diese Bewertung wurde bereits abgegeben.'], Response::HTTP_CONFLICT);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        $ratings = [];
        foreach (['ratingService', 'ratingFood', 'ratingAmbiance', 'ratingValue'] as $key) {
            $value = $data[$key] ?? null;
            if (!is_int($value) && !is_numeric($value)) {
                return $this->json(['error' => 'Bitte alle Kategorien bewerten.'], Response::HTTP_UNPROCESSABLE_ENTITY);
            }
            $value = (int) $value;
            if ($value < 1 || $value > 5) {
                return $this->json(['error' => 'Bewertungen müssen zwischen 1 und 5 liegen.'], Response::HTTP_UNPROCESSABLE_ENTITY);
            }
            $ratings[$key] = $value;
        }

        $comment = trim((string) ($data['comment'] ?? ''));

        $review->submit(
            service:  $ratings['ratingService'],
            food:     $ratings['ratingFood'],
            ambiance: $ratings['ratingAmbiance'],
            value:    $ratings['ratingValue'],
            comment:  $comment !== '' ? $comment : null,
        );

        $this->repo->save($review);

        return $this->json(['ok' => true]);
    }
}