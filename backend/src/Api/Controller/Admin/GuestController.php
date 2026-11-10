<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Messenger\Message\SendCancellationEmail;
use App\Messenger\Message\SendConfirmationEmail;
use App\Messenger\Message\SendNoShowEmail;
use App\Messenger\Message\SendReminderEmail;
use App\Module\Reservation\Application\Query\ListGuests\ListGuestsHandler;
use App\Module\Reservation\Application\Query\ListGuests\ListGuestsQuery;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Infrastructure\Persistence\DoctrineGuestRepository;
use App\Module\Reservation\Infrastructure\Persistence\DoctrineReservationRepository;
use App\Module\User\Domain\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/guests')]
class GuestController extends AbstractController
{
    public function __construct(
        private readonly ListGuestsHandler            $listHandler,
        private readonly DoctrineGuestRepository      $repo,
        private readonly DoctrineReservationRepository $reservationRepo,
        private readonly EntityManagerInterface       $em,
        private readonly MessageBusInterface          $bus,
    ) {}

    // ── Liste ─────────────────────────────────────────────────────────────────

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

    // ── Reservierungen eines Gastes ───────────────────────────────────────────

    #[Route('/{id}/reservations', name: 'admin_guest_reservations', methods: ['GET'])]
    public function reservations(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['reservations' => []], Response::HTTP_FORBIDDEN);
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

        $upcomingOnly = filter_var($request->query->get('upcoming', false), FILTER_VALIDATE_BOOLEAN);
        $now          = new \DateTimeImmutable();

        $reservations = $guest->getReservations()
            ->filter(function (Reservation $r) use ($upcomingOnly, $now) {
                if ($upcomingOnly) {
                    return $r->getStartsAt() >= $now;
                }
                return true;
            })
            ->toArray();

        // Sortierung: aufsteigend nach Datum (neueste Zukunft zuerst, dann Vergangenheit)
        usort($reservations, fn (Reservation $a, Reservation $b) =>
            $b->getStartsAt() <=> $a->getStartsAt()
        );

        $serialized = array_map([$this, 'serializeReservation'], array_values($reservations));

        // Durchschnittliche Gruppengröße über alle Reservierungen (nicht nur gefilterte)
        $allReservations = $guest->getReservations()->toArray();
        $avgPartySize = count($allReservations) > 0
            ? round(array_sum(array_map(fn (Reservation $r) => $r->getPartySize(), $allReservations)) / count($allReservations), 1)
            : 0;

        return $this->json([
            'reservations'  => $serialized,
            'avg_party_size' => $avgPartySize,
        ]);
    }

    // ── Update ────────────────────────────────────────────────────────────────

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
        if (array_key_exists('allergene', $data) && is_array($data['allergene'])) {
            $guest->setAllergene(array_filter($data['allergene'], 'is_string'));
        }
        if (array_key_exists('birthday', $data)) {
            $guest->setBirthday($data['birthday'] ? new \DateTimeImmutable($data['birthday']) : null);
        }
        if (array_key_exists('wedding_date', $data)) {
            $guest->setWeddingDate($data['wedding_date'] ? new \DateTimeImmutable($data['wedding_date']) : null);
        }
        if (array_key_exists('allergies', $data)) {
            $guest->setAllergies($data['allergies'] !== '' ? (string) $data['allergies'] : null);
        }

        $this->em->flush();

        return $this->json($this->serialize($guest));
    }

    // ── E-Mail erneut versenden ───────────────────────────────────────────────

    #[Route('/{id}/resend-email', name: 'admin_guest_resend_email', methods: ['POST'])]
    public function resendEmail(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
        }

        try {
            $guestUuid = Uuid::fromString($id);
        } catch (\Throwable) {
            return $this->json(['error' => 'Ungültige Gast-ID.'], Response::HTTP_BAD_REQUEST);
        }

        $guest = $this->repo->findById($guestUuid);
        if ($guest === null || $guest->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return $this->json(['error' => 'Gast nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data          = json_decode($request->getContent(), true) ?? [];
        $type          = (string) ($data['type'] ?? '');
        $reservationId = (string) ($data['reservation_id'] ?? '');

        $allowedTypes = ['confirmation', 'reminder', 'cancel', 'no_show'];
        if (!in_array($type, $allowedTypes, true)) {
            return $this->json(['error' => 'Ungültiger Mail-Typ.'], Response::HTTP_BAD_REQUEST);
        }

        if ($guest->getEmail() === '') {
            return $this->json(['error' => 'Gast hat keine E-Mail-Adresse.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // Reservierung suchen — entweder die angegebene oder die letzte des Gastes
        $reservation = null;
        if ($reservationId !== '') {
            try {
                $resUuid = Uuid::fromString($reservationId);
                $reservation = $this->reservationRepo->findById($resUuid);
                if ($reservation !== null && $reservation->getVenue()->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
                    $reservation = null;
                }
            } catch (\Throwable) {
                // ignore invalid UUID
            }
        }

        if ($reservation === null) {
            // Fallback: letzte Reservierung des Gastes
            $reservations = $guest->getReservations()->toArray();
            if (count($reservations) > 0) {
                usort($reservations, fn (Reservation $a, Reservation $b) =>
                    $b->getStartsAt() <=> $a->getStartsAt()
                );
                $reservation = $reservations[0];
            }
        }

        if ($reservation === null) {
            return $this->json(['error' => 'Keine Reservierung für diesen Gast gefunden.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $venueName = $reservation->getVenue()->getName();
        $startsAt  = $reservation->getStartsAt()->format('d.m.Y H:i');
        $tenantId  = $reservation->getVenue()->getTenant()->getId()->toRfc4122();

        match ($type) {
            'confirmation' => $this->bus->dispatch(new SendConfirmationEmail(
                reservationId:    $reservation->getId()->toRfc4122(),
                guestEmail:       $guest->getEmail(),
                guestName:        $guest->getName(),
                reservationToken: $reservation->getToken(),
                startsAt:         $startsAt,
                partySize:        $reservation->getPartySize(),
                venueName:        $venueName,
                tenantId:         $tenantId,
            )),
            'reminder' => $this->bus->dispatch(new SendReminderEmail(
                reservationId: $reservation->getId()->toRfc4122(),
                guestEmail:    $guest->getEmail(),
                guestName:     $guest->getName(),
                startsAt:      $startsAt,
                venueName:     $venueName,
                partySize:     $reservation->getPartySize(),
                tenantId:      $tenantId,
            )),
            'cancel' => $this->bus->dispatch(new SendCancellationEmail(
                reservationId: $reservation->getId()->toRfc4122(),
                guestEmail:    $guest->getEmail(),
                guestName:     $guest->getName(),
                startsAt:      $startsAt,
                venueName:     $venueName,
                tenantId:      $tenantId,
            )),
            'no_show' => $this->bus->dispatch(new SendNoShowEmail(
                reservationId: $reservation->getId()->toRfc4122(),
                guestEmail:    $guest->getEmail(),
                guestName:     $guest->getName(),
                startsAt:      $startsAt,
                venueName:     $venueName,
                tenantId:      $tenantId,
            )),
        };

        return $this->json(['sent' => true, 'type' => $type, 'to' => $guest->getEmail()]);
    }

    // ── Erinnerungen: alle Gäste eines Tenants (für Dashboard) ───────────────

    #[Route('/reminders', name: 'admin_reminders_list', methods: ['GET'])]
    public function listReminders(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['reminders' => []]);
        }

        $allGuests = $this->repo->findAllByTenant($tenant->getId());
        $reminders = [];
        foreach ($allGuests as $g) {
            foreach ($g->getReminders() as $r) {
                $reminders[] = array_merge($r, [
                    'guestId'   => $g->getId()->toRfc4122(),
                    'guestName' => $g->getName(),
                ]);
            }
        }

        return $this->json(['reminders' => $reminders]);
    }

    // ── Erinnerung hinzufügen ─────────────────────────────────────────────────

    #[Route('/{id}/reminders', name: 'admin_guest_reminder_add', methods: ['POST'])]
    public function addReminder(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
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
        $note    = trim((string) ($data['note'] ?? ''));
        $dueDate = trim((string) ($data['dueDate'] ?? ''));
        $remId   = trim((string) ($data['id'] ?? '')) ?: (string) Uuid::v7();

        if ($note === '' || $dueDate === '') {
            return $this->json(['error' => 'note und dueDate sind erforderlich.'], Response::HTTP_BAD_REQUEST);
        }

        $reminder = [
            'id'        => $remId,
            'note'      => $note,
            'dueDate'   => $dueDate,
            'createdAt' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
            'dismissed' => false,
        ];

        $guest->addReminder($reminder);
        $this->em->flush();

        return $this->json([
            'reminders' => array_map(
                fn (array $r) => array_merge($r, ['guestId' => $guest->getId()->toRfc4122(), 'guestName' => $guest->getName()]),
                $guest->getReminders()
            ),
        ]);
    }

    // ── Erinnerung löschen ────────────────────────────────────────────────────

    #[Route('/{id}/reminders/{reminderId}', name: 'admin_guest_reminder_delete', methods: ['DELETE'])]
    public function deleteReminder(string $id, string $reminderId, #[CurrentUser] User $user): JsonResponse
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

        $guest->removeReminder($reminderId);
        $this->em->flush();

        return $this->json([
            'reminders' => array_map(
                fn (array $r) => array_merge($r, ['guestId' => $guest->getId()->toRfc4122(), 'guestName' => $guest->getName()]),
                $guest->getReminders()
            ),
        ]);
    }

    // ── Erinnerung als erledigt markieren ─────────────────────────────────────

    #[Route('/{id}/reminders/{reminderId}/dismiss', name: 'admin_guest_reminder_dismiss', methods: ['PATCH'])]
    public function dismissReminder(string $id, string $reminderId, #[CurrentUser] User $user): JsonResponse
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

        $guest->dismissReminder($reminderId);
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    // ── Serializer ────────────────────────────────────────────────────────────

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
            'allergene'           => $g->getAllergene(),
            'total_reservations'  => $g->getTotalReservations(),
            'no_show_count'       => $g->getNoShowCount(),
            'reliability_score'   => $g->getReliabilityScore(),
            'cancellation_count'  => $g->getCancellationCount(),
            'cancellation_rate'   => $g->getCancellationRate(),
            'last_visit_at'       => $g->getLastVisitAt()?->format('Y-m-d'),
            'allergies'           => $g->getAllergies(),
            'total_revenue_cents' => $g->getTotalRevenueCents(),
            'birthday'            => $g->getBirthday()?->format('Y-m-d'),
            'wedding_date'        => $g->getWeddingDate()?->format('Y-m-d'),
            'created_at'          => $g->getCreatedAt()->format('Y-m-d'),
        ];
    }

    private function serializeReservation(Reservation $r): array
    {
        return [
            'id'          => $r->getId()->toRfc4122(),
            'starts_at'   => $r->getStartsAt()->format('Y-m-d H:i'),
            'ends_at'     => $r->getEndsAt()->format('Y-m-d H:i'),
            'party_size'  => $r->getPartySize(),
            'status'      => $r->getStatus(),
            'table_number'=> $r->getTableNumber(),
            'guest_notes' => $r->getGuestNotes(),
            'admin_notes' => $r->getAdminNotes(),
            'venue_name'  => $r->getVenue()->getName(),
        ];
    }
}
