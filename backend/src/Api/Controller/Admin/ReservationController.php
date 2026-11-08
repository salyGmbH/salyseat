<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Reservation\Application\Command\AdminCancelReservation\AdminCancelReservationCommand;
use App\Module\Reservation\Application\Command\AdminCancelReservation\AdminCancelReservationHandler;
use App\Module\Reservation\Application\Command\CompleteReservation\CompleteReservationCommand;
use App\Module\Reservation\Application\Command\CompleteReservation\CompleteReservationHandler;
use App\Module\Reservation\Application\Command\ConfirmReservation\ConfirmReservationCommand;
use App\Module\Reservation\Application\Command\ConfirmReservation\ConfirmReservationHandler;
use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationCommand;
use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationHandler;
use App\Module\Reservation\Application\Command\MarkNoShow\MarkNoShowCommand;
use App\Module\Reservation\Application\Command\MarkNoShow\MarkNoShowHandler;
use App\Module\Reservation\Application\Command\ReopenReservation\ReopenReservationCommand;
use App\Module\Reservation\Application\Command\ReopenReservation\ReopenReservationHandler;
use App\Module\Reservation\Application\Command\UpdateReservation\UpdateReservationCommand;
use App\Module\Reservation\Application\Command\UpdateReservation\UpdateReservationHandler;
use App\Module\Reservation\Application\Dto\ReservationDto;
use App\Module\Reservation\Application\Query\GetReservation\GetReservationHandler;
use App\Module\Reservation\Application\Query\GetReservation\GetReservationQuery;
use App\Module\Reservation\Application\Query\ListReservations\ListReservationsHandler;
use App\Module\Reservation\Application\Query\ListReservations\ListReservationsQuery;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use App\Module\User\Domain\Entity\User;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/reservations')]
class ReservationController extends AbstractController
{
    public function __construct(
        private readonly ListReservationsHandler $listHandler,
        private readonly GetReservationHandler $getHandler,
        private readonly ConfirmReservationHandler $confirmHandler,
        private readonly MarkNoShowHandler $noShowHandler,
        private readonly CreateReservationHandler $createHandler,
        private readonly UpdateReservationHandler $updateHandler,
        private readonly AdminCancelReservationHandler $cancelHandler,
        private readonly CompleteReservationHandler $completeHandler,
        private readonly ReopenReservationHandler $reopenHandler,
        private readonly ReservationRepositoryInterface $reservationRepo,
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * POST /api/v1/admin/reservations
     * Admin legt eine Reservierung manuell an (z. B. Telefonbuchung).
     */
    #[Route('', name: 'admin_reservation_create', methods: ['POST'])]
    public function create(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        $data    = json_decode($request->getContent(), true) ?? [];
        $venueId = trim((string) ($data['venue_id'] ?? ''));

        if ($venueId === '') {
            return $this->json(['error' => 'venue_id ist erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // Tenant-Isolation: Venue muss zum Tenant des Admins gehören
        $venue = $this->em->getRepository(Venue::class)->find($venueId);
        if ($venue === null || $venue->getTenant() !== $tenant) {
            return $this->json(['error' => 'Venue nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $guestName = trim((string) ($data['guest_name'] ?? ''));
        if ($guestName === '') {
            return $this->json(['error' => 'Gastname ist erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $guestEmail = trim((string) ($data['guest_email'] ?? ''));
        if ($guestEmail !== '' && !filter_var($guestEmail, FILTER_VALIDATE_EMAIL)) {
            return $this->json(['error' => 'Ungültige E-Mail-Adresse.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // Kein E-Mail angegeben → eindeutiger Platzhalter, damit Guest-Unique-Constraint nicht feuert
        if ($guestEmail === '') {
            $guestEmail = sprintf('admin+%s@noemail.local', bin2hex(random_bytes(6)));
        }

        try {
            $startsAt = new \DateTimeImmutable((string) ($data['starts_at'] ?? ''));
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum für starts_at.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $reservation = ($this->createHandler)(new CreateReservationCommand(
                venueId:    $venueId,
                guestName:  $guestName,
                guestEmail: $guestEmail,
                partySize:  max(1, (int) ($data['party_size'] ?? 1)),
                startsAt:   $startsAt,
                guestPhone: ($data['guest_phone'] ?? '') !== '' ? (string) $data['guest_phone'] : null,
                guestNotes:      ($data['notes'] ?? '') !== '' ? (string) $data['notes'] : null,
                durationMinutes: isset($data['duration_minutes']) ? (int) $data['duration_minutes'] : null,
                tableNumber:     isset($data['table_id'])         ? (int) $data['table_id']         : null,
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(ReservationDto::fromEntity($reservation)->toArray(), Response::HTTP_CREATED);
    }

    #[Route('', name: 'admin_reservation_list', methods: ['GET'])]
    public function list(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['reservations' => [], 'total' => 0]);
        }

        $query = new ListReservationsQuery(
            tenantId: $tenant->getId()->toRfc4122(),
            status:   $request->query->get('status'),
            date:     $request->query->get('date'),
            limit:    (int) $request->query->get('limit', 50),
            offset:   (int) $request->query->get('offset', 0),
        );

        return $this->json(($this->listHandler)($query));
    }

    /**
     * GET /api/v1/admin/reservations/{id}
     */
    #[Route('/{id}', name: 'admin_reservation_get', methods: ['GET'])]
    public function get(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $dto = ($this->getHandler)(new GetReservationQuery(
                reservationId: $id,
                tenantId:      $tenant->getId()->toRfc4122(),
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_NOT_FOUND);
        }

        return $this->json($dto->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}
     * Gast-Daten, Personenzahl, Uhrzeit oder Notizen aktualisieren.
     */
    #[Route('/{id}', name: 'admin_reservation_update', methods: ['PATCH'])]
    public function update(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        $partySize = isset($data['party_size']) ? (int) $data['party_size'] : null;
        if ($partySize !== null && $partySize < 1) {
            return $this->json(['error' => 'Personenanzahl muss mindestens 1 sein.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $startsAt = null;
        if (isset($data['starts_at'])) {
            try {
                $startsAt = new \DateTimeImmutable((string) $data['starts_at']);
            } catch (\Exception) {
                return $this->json(['error' => 'Ungültiges Datum für starts_at.'], Response::HTTP_UNPROCESSABLE_ENTITY);
            }
        }

        // table_id: null = unassign, int = assign, key absent = no change
        $tableNumber = false;
        if (array_key_exists('table_id', $data)) {
            $tableNumber = $data['table_id'] === null ? null : (int) $data['table_id'];
        }

        try {
            $reservation = ($this->updateHandler)(new UpdateReservationCommand(
                reservationId:   $id,
                tenantId:        $tenant->getId()->toRfc4122(),
                guestName:       isset($data['guest_name']) ? trim((string) $data['guest_name']) : null,
                partySize:       $partySize,
                startsAt:        $startsAt,
                durationMinutes: isset($data['duration_minutes']) ? (int) $data['duration_minutes'] : null,
                guestPhone:      isset($data['guest_phone']) ? trim((string) $data['guest_phone']) : null,
                guestNotes:      isset($data['notes']) ? trim((string) $data['notes']) : null,
                tableNumber:     $tableNumber,
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_NOT_FOUND);
        }

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}/confirm
     */
    #[Route('/{id}/confirm', name: 'admin_reservation_confirm', methods: ['PATCH'])]
    public function confirm(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $reservation = ($this->confirmHandler)(new ConfirmReservationCommand(
                reservationId: $id,
                tenantId:      $tenant->getId()->toRfc4122(),
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}/no-show
     */
    #[Route('/{id}/no-show', name: 'admin_reservation_noshow', methods: ['PATCH'])]
    public function noShow(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $reservation = ($this->noShowHandler)(new MarkNoShowCommand(
                reservationId: $id,
                tenantId:      $tenant->getId()->toRfc4122(),
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}/cancel
     */
    #[Route('/{id}/cancel', name: 'admin_reservation_cancel', methods: ['PATCH'])]
    public function cancel(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $reservation = ($this->cancelHandler)(new AdminCancelReservationCommand(
                reservationId: $id,
                tenantId:      $tenant->getId()->toRfc4122(),
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}/complete
     */
    #[Route('/{id}/complete', name: 'admin_reservation_complete', methods: ['PATCH'])]
    public function complete(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $reservation = ($this->completeHandler)(new CompleteReservationCommand(
                reservationId: $id,
                tenantId:      $tenant->getId()->toRfc4122(),
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}/reopen
     */
    #[Route('/{id}/reopen', name: 'admin_reservation_reopen', methods: ['PATCH'])]
    public function reopen(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $reservation = ($this->reopenHandler)(new ReopenReservationCommand(
                reservationId: $id,
                tenantId:      $tenant->getId()->toRfc4122(),
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}/seat
     * Gast ist eingecheckt / sitzt am Tisch.
     */
    #[Route('/{id}/seat', name: 'admin_reservation_seat', methods: ['PATCH'])]
    public function seat(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        $reservation = $this->reservationRepo->findById(Uuid::fromString($id));
        if ($reservation === null || $reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return $this->json(['error' => 'Reservierung nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $reservation->seat();
        $this->reservationRepo->save($reservation);

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }

    /**
     * PATCH /api/v1/admin/reservations/{id}/cleanup
     * Besuch beendet, Tisch wird gerade gereinigt.
     */
    #[Route('/{id}/cleanup', name: 'admin_reservation_cleanup', methods: ['PATCH'])]
    public function cleanup(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant zugewiesen.'], Response::HTTP_FORBIDDEN);
        }

        $reservation = $this->reservationRepo->findById(Uuid::fromString($id));
        if ($reservation === null || $reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return $this->json(['error' => 'Reservierung nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $reservation->startCleanup();
        $this->reservationRepo->save($reservation);

        return $this->json(ReservationDto::fromEntity($reservation)->toArray());
    }
}
