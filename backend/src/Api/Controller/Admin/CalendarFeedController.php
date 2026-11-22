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

/**
 * Tenant-seitige Verwaltung des Kalender-Abo-Links (siehe IcsFeedController).
 * Das Token selbst wird lazy generiert — beim ersten Abruf, falls noch keins
 * existiert — damit bestehende Tenants ohne Migration-Backfill sofort eine
 * Feed-URL bekommen, sobald sie die Einstellungsseite öffnen.
 */
#[Route('/calendar')]
class CalendarFeedController extends AbstractController
{
    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
    ) {}

    #[Route('/feed-url', name: 'admin_calendar_feed_url', methods: ['GET'])]
    public function feedUrl(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $tenant = $user->getTenant();

        if ($tenant->getCalendarFeedToken() === null) {
            $tenant->setCalendarFeedToken(bin2hex(random_bytes(24)));
            $this->tenants->save($tenant);
        }

        return $this->json(['url' => $this->buildUrl($request, $tenant->getCalendarFeedToken())]);
    }

    #[Route('/regenerate', name: 'admin_calendar_regenerate', methods: ['POST'])]
    public function regenerate(#[CurrentUser] User $user, Request $request): JsonResponse
    {
        $tenant = $user->getTenant();
        $tenant->setCalendarFeedToken(bin2hex(random_bytes(24)));
        $this->tenants->save($tenant);

        return $this->json(['url' => $this->buildUrl($request, $tenant->getCalendarFeedToken())]);
    }

    private function buildUrl(Request $request, string $token): string
    {
        return $request->getSchemeAndHttpHost() . '/api/v1/calendar/' . $token . '.ics';
    }
}