<?php

declare(strict_types=1);

namespace App\Api\Controller\Calendar;

use App\Module\Calendar\Application\IcsFeedGenerator;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * GET /api/v1/calendar/{token}.ics
 *
 * Privater, per Kalender-Client abonnierbarer .ics-Feed (Google Calendar,
 * Apple Kalender, Outlook — "Kalender per URL hinzufügen"). Öffentlich —
 * gesichert durch das opake Token selbst, nicht durch JWT (Kalender-Apps
 * können sich nicht interaktiv einloggen), analog zum Widget-Public-Key und
 * zum WhatsApp-Webhook-Secret.
 */
#[Route('/api/v1/calendar/{token}.ics', name: 'calendar_ics_feed', methods: ['GET'])]
class IcsFeedController extends AbstractController
{
    /** Zeitfenster um "heute" — begrenzt die Feed-Größe, ohne echten Wert zu verlieren. */
    private const DAYS_PAST   = 7;
    private const DAYS_FUTURE = 180;
    private const MAX_EVENTS  = 2000;

    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
        private readonly ReservationRepositoryInterface $reservations,
        private readonly IcsFeedGenerator $generator,
    ) {}

    public function __invoke(string $token): Response
    {
        $tenant = $this->tenants->findByCalendarFeedToken($token);
        if ($tenant === null) {
            return new Response('Not found', Response::HTTP_NOT_FOUND);
        }

        $now = new \DateTimeImmutable('today');

        $reservations = $this->reservations->findByTenant(
            tenantId: $tenant->getId(),
            limit:    self::MAX_EVENTS,
            dateFrom: $now->modify('-' . self::DAYS_PAST . ' days'),
            dateTo:   $now->modify('+' . self::DAYS_FUTURE . ' days'),
        );

        $reservations = array_values(array_filter(
            $reservations,
            static fn ($r) => !in_array($r->getStatus(), ['cancelled', 'no_show'], true),
        ));

        $ics = $this->generator->generate($tenant, $reservations);

        $response = new Response($ics);
        $response->headers->set('Content-Type', 'text/calendar; charset=utf-8');
        $response->headers->set('Content-Disposition', 'inline; filename="reservierungen.ics"');
        // Kalender-Clients pollen selbst regelmäßig — kein aggressives Caching nötig,
        // aber kurzes Caching verhindert unnötige Last bei sehr häufigem Polling.
        $response->headers->set('Cache-Control', 'private, max-age=300');

        return $response;
    }
}