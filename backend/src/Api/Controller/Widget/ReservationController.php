<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Reservation\Application\Command\CancelReservation\CancelReservationCommand;
use App\Module\Reservation\Application\Command\CancelReservation\CancelReservationHandler;
use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationCommand;
use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationHandler;
use App\Module\Reservation\Application\Dto\ReservationDto;
use App\Module\Reservation\Application\Query\GetReservationByToken\GetReservationByTokenHandler;
use App\Module\Reservation\Application\Query\GetReservationByToken\GetReservationByTokenQuery;
use App\Module\Availability\Infrastructure\Persistence\DoctrineOpeningHoursRepository;
use App\Module\Availability\Infrastructure\Persistence\DoctrineSpecialClosingRepository;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/reservations')]
class ReservationController extends AbstractController
{
    public function __construct(
        private readonly ValidatorInterface $validator,
        private readonly CreateReservationHandler $createHandler,
        private readonly CancelReservationHandler $cancelHandler,
        private readonly GetReservationByTokenHandler $statusHandler,
        private readonly DoctrineTenantRepository $tenants,
        private readonly EntityManagerInterface $em,
        private readonly DoctrineOpeningHoursRepository $ohRepo,
        private readonly DoctrineSpecialClosingRepository $scRepo,
        private readonly Connection $dbal,
    ) {}

    /**
     * GET /api/v1/widget/config/{publicKey}
     * Gibt Restaurantname + aktive Venues zurück — kein Auth nötig.
     */
    #[Route('/config/{publicKey}', name: 'widget_config', methods: ['GET'])]
    public function config(string $publicKey): JsonResponse
    {
        $tenant = $this->tenants->findByPublicKey($publicKey);

        if ($tenant === null || !$tenant->isActive()) {
            return $this->json(['error' => 'Restaurant nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $venueList = $this->em->createQueryBuilder()
            ->select('v')
            ->from('App\Module\Venue\Domain\Entity\Venue', 'v')
            ->where('IDENTITY(v.tenant) = :tenantId')
            ->andWhere('v.active = :active')
            ->setParameter('tenantId', $tenant->getId()->toBinary())
            ->setParameter('active', true)
            ->orderBy('v.name', 'ASC')
            ->getQuery()
            ->getResult();

        $closedWeekdays  = [];
        $openingSchedule = [];
        foreach ($this->ohRepo->findByTenant($tenant) as $oh) {
            if (!$oh->isOpen()) {
                $closedWeekdays[] = $oh->getWeekday();
            } else {
                $openingSchedule[$oh->getWeekday()] = [
                    'open_time'  => $oh->getOpenTime(),
                    'close_time' => $oh->getCloseTime(),
                    'breaks'     => $oh->getBreaks() ?? [],
                ];
            }
        }

        // Sonder-Schließtage: nur fullDay=true Einträge als Datumsbereiche ans Widget übergeben.
        // Das Widget prüft beim Kalender-Rendering ob ein Datum in einem Bereich liegt.
        $specialClosedRanges = [];
        foreach ($this->scRepo->findByTenant($tenant) as $sc) {
            if ($sc->isFullDay()) {
                $specialClosedRanges[] = [
                    'date_from' => $sc->getDateFrom()->format('Y-m-d'),
                    'date_to'   => $sc->getDateTo()->format('Y-m-d'),
                ];
            }
        }

        $uiSettings = $tenant->getUiSettings() ?? [];

        // Packages nur ausliefern wenn der Owner "Package-Buchung" im Widget aktiviert hat,
        // und nur aktive Packages — Entwürfe/deaktivierte bleiben intern.
        $packageBuchungAktiv = (bool) ($uiSettings['widgetFunctional']['packageBuchung'] ?? false);
        $packages = $packageBuchungAktiv
            ? array_values(array_map(fn (array $p) => [
                'id'             => $p['id']             ?? null,
                'name'           => $p['name']            ?? '',
                'description'    => $p['description']     ?? '',
                'category'       => $p['category']        ?? 'sonstiges',
                'pricePerPerson' => $p['pricePerPerson']  ?? 0,
                'minPeople'      => $p['minPeople']       ?? 1,
                'maxPeople'      => $p['maxPeople']       ?? 99,
                'durationHours'  => $p['durationHours']   ?? null,
                'includes'       => $p['includes']        ?? [],
                'image'          => $p['image']           ?? null,
            ], array_filter($uiSettings['packages'] ?? [], fn (array $p) => !empty($p['active']))))
            : [];

        // Venue-Sperrzeiten (alle zukünftigen + laufenden) für das Widget laden
        $venueBlockRows = $this->dbal->fetchAllAssociative(
            'SELECT LOWER(CONCAT(
                SUBSTR(HEX(venue_id),1,8), \'-\',
                SUBSTR(HEX(venue_id),9,4), \'-\',
                SUBSTR(HEX(venue_id),13,4), \'-\',
                SUBSTR(HEX(venue_id),17,4), \'-\',
                SUBSTR(HEX(venue_id),21)
             )) AS venue_id,
             date_from, date_to, full_day, time_from, time_to
               FROM venue_blocks vb
              WHERE vb.venue_id IN (
                SELECT id FROM venues WHERE tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
              )
                AND date_to >= CURDATE()',
            [$tenant->getId()->toRfc4122()],
        );

        // Gruppieren nach venue_id
        $venueBlocksByVenue = [];
        foreach ($venueBlockRows as $row) {
            $venueBlocksByVenue[$row['venue_id']][] = [
                'date_from' => $row['date_from'],
                'date_to'   => $row['date_to'],
                'full_day'  => (bool) $row['full_day'],
                'time_from' => $row['time_from'],
                'time_to'   => $row['time_to'],
            ];
        }

        return $this->json([
            'name'         => $tenant->getName(),
            'venues'       => array_map(fn ($v) => [
                'id'           => $v->getId()->toRfc4122(),
                'name'         => $v->getName(),
                'category'     => $v->getCategory(),
                'address'      => $v->getAddress(),
                'tables'       => $v->getLayout()['tables'] ?? [],
                'walls'        => $v->getLayout()['walls']  ?? [],
                'decors'       => $v->getLayout()['decors'] ?? [],
                'blockedRanges' => $venueBlocksByVenue[$v->getId()->toRfc4122()] ?? [],
            ], $venueList),
            'widgetDesign'         => $uiSettings['widgetDesign'] ?? null,
            'widgetFunctional'     => array_merge(
                $uiSettings['widgetFunctional'] ?? [],
                [
                    'defaultDurationMinutes' => $uiSettings['reservationTiming']['defaultDurationMinutes'] ?? 120,
                    // Clean-up-Puffer (Minuten vor/nach einer Reservierung, in denen der
                    // Tisch für andere Buchungen gesperrt bleibt) — muss dem Widget bekannt
                    // sein, damit die Zeitslot-Verfügbarkeitsprüfung (timeSlots() in
                    // start.component.ts) denselben Puffer anwendet wie die tatsächliche
                    // Tischzuweisung beim Absenden (findBestTable() in
                    // CreateReservationHandler.php). Ohne diesen Wert könnte das Widget
                    // einen Slot als buchbar anzeigen, den das Backend beim echten Absenden
                    // wegen des Puffers ablehnt — die Reservierung landet dann unbemerkt auf
                    // der Warteliste, obwohl die Auswahl im Widget frei aussah.
                    'cleanupMinutes' => !empty($uiSettings['reservationTiming']['cleanupEnabled'])
                        ? (int) ($uiSettings['reservationTiming']['cleanupMinutes'] ?? 0)
                        : 0,
                ],
            ),
            'widgetLanguage'       => $uiSettings['widgetLanguage'] ?? 'de',
            'allergene'            => $uiSettings['allergene'] ?? [],
            'packages'             => $packages,
            'stripePublishableKey' => $uiSettings['stripeSettings']['publishableKey'] ?? null,
            'closedWeekdays'      => $closedWeekdays,
            'openingSchedule'     => $openingSchedule,
            'specialClosedRanges' => $specialClosedRanges,
        ]);
    }

    /**
     * POST /api/v1/widget/reservations
     * Erstellt eine Reservierung. venue_id bestimmt welches Venue gebucht wird.
     */
    #[Route('', name: 'widget_reservation_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $constraints = new Assert\Collection([
            'venue_id'    => [new Assert\NotBlank(), new Assert\Uuid()],
            'guest_name'  => [new Assert\NotBlank(), new Assert\Length(min: 2, max: 255)],
            'guest_first_name' => new Assert\Optional([new Assert\Length(max: 255)]),
            'guest_email' => [new Assert\NotBlank(), new Assert\Email()],
            'guest_phone' => new Assert\Optional([new Assert\Length(max: 20)]),
            'party_size'  => [new Assert\NotBlank(), new Assert\Range(min: 1, max: 50)],
            'starts_at'   => [new Assert\NotBlank(), new Assert\DateTime(\DateTimeInterface::ATOM)],
            'notes'       => new Assert\Optional([new Assert\Length(max: 1000)]),
            'occasion'    => new Assert\Optional([new Assert\Length(max: 255)]),
            'table_id'         => new Assert\Optional([new Assert\Type('integer'), new Assert\Positive()]),
            'duration_minutes' => new Assert\Optional([new Assert\Type('integer'), new Assert\Positive()]),
            'packages'         => new Assert\Optional([new Assert\Type('array')]),
        ]);

        $violations = $this->validator->validate($data ?? [], $constraints);

        if (count($violations) > 0) {
            $errors = [];
            foreach ($violations as $violation) {
                $errors[$violation->getPropertyPath()] = $violation->getMessage();
            }
            return $this->json(['errors' => $errors], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $reservation = ($this->createHandler)(new CreateReservationCommand(
                venueId:     $data['venue_id'],
                guestName:   $data['guest_name'],
                guestEmail:  $data['guest_email'],
                partySize:   (int) $data['party_size'],
                startsAt:    $this->parseStartsAtInVenueTimezone($data['venue_id'], $data['starts_at']),
                guestPhone:  $data['guest_phone'] ?? null,
                guestNotes:  $data['notes'] ?? null,
                guestFirstName:  ($data['guest_first_name'] ?? '') !== '' ? (string) $data['guest_first_name'] : null,
                occasion:        ($data['occasion'] ?? '') !== '' ? (string) $data['occasion'] : null,
                tableNumber:     isset($data['table_id'])         ? (int) $data['table_id']         : null,
                durationMinutes: isset($data['duration_minutes']) ? (int) $data['duration_minutes'] : null,
                source:          'online',
                packages:        $data['packages'] ?? null,
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(
            [
                'reservation' => ReservationDto::fromEntity($reservation)->toArray(),
                'message'     => 'Reservierung erfolgreich erstellt. Sie erhalten eine Bestätigungsmail.',
            ],
            Response::HTTP_CREATED,
        );
    }

    /**
     * Baut $startsAt aus dem vom Widget gesendeten ATOM-String, ABER mit der
     * echten Zeitzone des Venues statt des vom String mitgelieferten Offsets.
     *
     * Grund: reservations.service.ts (toAtomDateTime()) hängt an die vom Gast
     * gewählte Uhrzeit den Zeitzonen-Offset des GASTE-GERÄTS an, nicht den
     * des Venues — die Uhrzeit selbst ("19:00") ist zwar korrekt, der Offset
     * kann aber falsch sein, wenn das Gerät des Gasts in einer anderen
     * Zeitzone steht als das Restaurant. Im Backend selbst fällt das i. d. R.
     * nicht auf, da überall nur die Uhrzeit-Komponenten (format('H:i') etc.)
     * gelesen werden, nie eine echte Offset-Umrechnung stattfindet — außer in
     * MewsConnector::createReservation(), das ->setTimezone(UTC) aufruft und
     * damit den (ggf. falschen) Offset tatsächlich verrechnet. Ein Gast, der
     * z. B. aus den USA einen Tisch für 19:00 in einem Berliner Restaurant
     * bucht, würde sonst mit falscher Uhrzeit ins angebundene PMS gepusht.
     *
     * Wir verwerfen daher den mitgelieferten Offset komplett und übernehmen
     * nur Datum+Uhrzeit (erste 19 Zeichen, "Y-m-dTH:i:s"), getaggt mit der
     * tatsächlichen Venue-Zeitzone.
     */
    private function parseStartsAtInVenueTimezone(string $venueId, string $rawStartsAt): \DateTimeImmutable
    {
        $venue    = $this->em->getRepository(Venue::class)->find($venueId);
        $timezone = new \DateTimeZone($venue?->getTimezone() ?? 'Europe/Berlin');

        // Nur die naiven Datum/Uhrzeit-Komponenten übernehmen — der im String
        // enthaltene Offset (letzte 6 Zeichen bei ATOM-Format) wird bewusst
        // ignoriert, s. Docblock oben.
        $naive = substr($rawStartsAt, 0, 19);

        return new \DateTimeImmutable($naive, $timezone);
    }

    /**
     * GET /api/v1/widget/reservations/{token}
     * Gibt den Status einer Reservierung zurück (für Gast-Links).
     */
    #[Route('/{token}', name: 'widget_reservation_status', methods: ['GET'])]
    public function status(string $token): JsonResponse
    {
        try {
            $dto = ($this->statusHandler)(new GetReservationByTokenQuery($token));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_NOT_FOUND);
        }

        return $this->json($dto->toArray());
    }

    /**
     * DELETE /api/v1/widget/reservations/{token}
     * Storniert eine Reservierung durch den Gast.
     */
    #[Route('/{token}', name: 'widget_reservation_cancel', methods: ['DELETE'])]
    public function cancel(string $token): JsonResponse
    {
        try {
            ($this->cancelHandler)(new CancelReservationCommand($token));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(['message' => 'Reservierung wurde erfolgreich storniert.']);
    }
}
