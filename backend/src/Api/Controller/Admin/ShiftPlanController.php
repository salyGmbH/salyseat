<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Messenger\Message\SendShiftPlanPdf;
use App\Module\Shift\Domain\Entity\ShiftAvailability;
use App\Module\Shift\Domain\Entity\ShiftEntry;
use App\Module\Shift\Domain\Entity\ShiftSettings;
use App\Module\Shift\Domain\Entity\ShiftSwapRequest;
use App\Module\Shift\Domain\Entity\ShiftTemplate;
use App\Module\Shift\Domain\Entity\TimeClockEntry;
use Doctrine\DBAL\Types\Types;
use Symfony\Bridge\Doctrine\Types\UuidType;
use App\Module\Shift\Domain\Entity\ShiftWage;
use App\Module\Staff\Domain\Entity\Staff;
use App\Module\Tenant\Domain\Entity\Tenant;
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

#[Route('/shift-plan')]
class ShiftPlanController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface    $bus,
    ) {}

    // ═══════════════════════════════════════════════════════════════════════
    // SHIFTS
    // ═══════════════════════════════════════════════════════════════════════

    /** GET /api/v1/admin/shift-plan/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD */
    #[Route('/shifts', name: 'admin_shifts_list', methods: ['GET'])]
    public function listShifts(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $from = $request->query->getString('from');
        $to   = $request->query->getString('to');

        $qb = $this->em->createQueryBuilder()
            ->select('s')->from(ShiftEntry::class, 's')
            ->where('s.tenant = :tenant')
            ->setParameter('tenant', $tenant->getId(), UuidType::NAME)
            ->orderBy('s.date', 'ASC');

        if ($from !== '') {
            try {
                $qb->andWhere('s.date >= :from')
                   ->setParameter('from', new \DateTimeImmutable($from), Types::DATE_IMMUTABLE);
            } catch (\Exception) {}
        }
        if ($to !== '') {
            try {
                $qb->andWhere('s.date <= :to')
                   ->setParameter('to', new \DateTimeImmutable($to), Types::DATE_IMMUTABLE);
            } catch (\Exception) {}
        }

        return $this->json(array_map($this->serializeShift(...), $qb->getQuery()->getResult()));
    }

    /** POST /api/v1/admin/shift-plan/shifts — upsert (employee+date eindeutig) */
    #[Route('/shifts', name: 'admin_shifts_upsert', methods: ['POST'])]
    public function upsertShift(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data = json_decode($request->getContent(), true) ?? [];

        try {
            $date = new \DateTimeImmutable((string) ($data['date'] ?? ''));
        } catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $employeeId = trim((string) ($data['employee_id'] ?? ''));
        $type       = trim((string) ($data['type']        ?? ''));

        if ($employeeId === '' || $type === '') {
            return $this->json(['error' => 'employee_id und type sind erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $startTime = ($data['start_time'] ?? '') !== '' ? (string) $data['start_time'] : null;
        $endTime   = ($data['end_time']   ?? '') !== '' ? (string) $data['end_time']   : null;
        $note      = ($data['note']       ?? '') !== '' ? (string) $data['note']       : null;

        // Upsert: bestehenden Eintrag suchen
        $shift = $this->em->getRepository(ShiftEntry::class)->findOneBy([
            'tenant'     => $tenant,
            'employeeId' => $employeeId,
            'date'       => $date,
        ]);

        if ($shift !== null) {
            $shift->update($type, $startTime, $endTime, $note);
        } else {
            $shift = new ShiftEntry($tenant, $employeeId, $date, $type, $startTime, $endTime, $note);
            $this->em->persist($shift);
        }

        $this->em->flush();

        return $this->json($this->serializeShift($shift), Response::HTTP_OK);
    }

    /** POST /api/v1/admin/shift-plan/shifts/bulk — mehrere Schichten auf einmal */
    #[Route('/shifts/bulk', name: 'admin_shifts_bulk', methods: ['POST'])]
    public function bulkUpsertShifts(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $items = json_decode($request->getContent(), true) ?? [];
        if (!is_array($items)) {
            return $this->json(['error' => 'Array erwartet.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $result = [];
        foreach ($items as $data) {
            try {
                $date = new \DateTimeImmutable((string) ($data['date'] ?? ''));
            } catch (\Exception) {
                continue;
            }

            $employeeId = trim((string) ($data['employee_id'] ?? ''));
            $type       = trim((string) ($data['type']        ?? ''));
            if ($employeeId === '' || $type === '') continue;

            $startTime = ($data['start_time'] ?? '') !== '' ? (string) $data['start_time'] : null;
            $endTime   = ($data['end_time']   ?? '') !== '' ? (string) $data['end_time']   : null;
            $note      = ($data['note']       ?? '') !== '' ? (string) $data['note']       : null;

            $shift = $this->em->getRepository(ShiftEntry::class)->findOneBy([
                'tenant' => $tenant, 'employeeId' => $employeeId, 'date' => $date,
            ]);

            if ($shift !== null) {
                $shift->update($type, $startTime, $endTime, $note);
            } else {
                $shift = new ShiftEntry($tenant, $employeeId, $date, $type, $startTime, $endTime, $note);
                $this->em->persist($shift);
            }
            $result[] = $shift;
        }

        $this->em->flush();

        return $this->json(array_map($this->serializeShift(...), $result));
    }

    /** DELETE /api/v1/admin/shift-plan/shifts/{id} */
    #[Route('/shifts/{id}', name: 'admin_shifts_delete', methods: ['DELETE'])]
    public function deleteShift(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $shift = $this->resolveShift($id, $tenant);
        if ($shift === null) {
            return $this->json(['error' => 'Schicht nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->em->remove($shift);
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    /** PATCH /api/v1/admin/shift-plan/shifts/{id}/employee — Mitarbeiter tauschen */
    #[Route('/shifts/{id}/employee', name: 'admin_shifts_reassign', methods: ['PATCH'])]
    public function reassignShift(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $shift = $this->resolveShift($id, $tenant);
        if ($shift === null) {
            return $this->json(['error' => 'Schicht nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data       = json_decode($request->getContent(), true) ?? [];
        $employeeId = trim((string) ($data['employee_id'] ?? ''));
        if ($employeeId === '') {
            return $this->json(['error' => 'employee_id erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $shift->setEmployeeId($employeeId);
        $this->em->flush();

        return $this->json($this->serializeShift($shift));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AVAILABILITY
    // ═══════════════════════════════════════════════════════════════════════

    /** GET /api/v1/admin/shift-plan/availability */
    #[Route('/availability', name: 'admin_shift_avail_list', methods: ['GET'])]
    public function listAvailability(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $list = $this->em->getRepository(ShiftAvailability::class)->findBy(['tenant' => $tenant]);
        return $this->json(array_map($this->serializeAvail(...), $list));
    }

    /** PUT /api/v1/admin/shift-plan/availability — upsert */
    #[Route('/availability', name: 'admin_shift_avail_upsert', methods: ['PUT'])]
    public function upsertAvailability(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data       = json_decode($request->getContent(), true) ?? [];
        $employeeId = trim((string) ($data['employee_id'] ?? ''));
        $weekday    = isset($data['weekday']) ? (int) $data['weekday'] : -1;
        $type       = trim((string) ($data['type'] ?? ''));

        if ($employeeId === '' || $weekday < 0 || $weekday > 6 || $type === '') {
            return $this->json(['error' => 'employee_id, weekday (0-6) und type erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $avail = $this->em->getRepository(ShiftAvailability::class)->findOneBy([
            'tenant' => $tenant, 'employeeId' => $employeeId, 'weekday' => $weekday,
        ]);

        if ($avail !== null) {
            $avail->setType($type);
        } else {
            $avail = new ShiftAvailability($tenant, $employeeId, $weekday, $type);
            $this->em->persist($avail);
        }

        $this->em->flush();
        return $this->json($this->serializeAvail($avail));
    }

    /** DELETE /api/v1/admin/shift-plan/availability/{employeeId}/{weekday} */
    #[Route('/availability/{employeeId}/{weekday}', name: 'admin_shift_avail_delete', methods: ['DELETE'])]
    public function deleteAvailability(string $employeeId, int $weekday, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $avail = $this->em->getRepository(ShiftAvailability::class)->findOneBy([
            'tenant' => $tenant, 'employeeId' => $employeeId, 'weekday' => $weekday,
        ]);

        if ($avail !== null) {
            $this->em->remove($avail);
            $this->em->flush();
        }

        return $this->json(['ok' => true]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════

    /** GET /api/v1/admin/shift-plan/templates */
    #[Route('/templates', name: 'admin_shift_templates_list', methods: ['GET'])]
    public function listTemplates(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $list = $this->em->getRepository(ShiftTemplate::class)->findBy(
            ['tenant' => $tenant],
            ['createdAt' => 'ASC'],
        );
        return $this->json(array_map($this->serializeTemplate(...), $list));
    }

    /** POST /api/v1/admin/shift-plan/templates */
    #[Route('/templates', name: 'admin_shift_templates_create', methods: ['POST'])]
    public function createTemplate(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data    = json_decode($request->getContent(), true) ?? [];
        $name    = trim((string) ($data['name']    ?? ''));
        $entries = $data['entries'] ?? [];

        if ($name === '') {
            return $this->json(['error' => 'Name erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $tpl = new ShiftTemplate($tenant, $name, is_array($entries) ? $entries : []);
        $this->em->persist($tpl);
        $this->em->flush();

        return $this->json($this->serializeTemplate($tpl), Response::HTTP_CREATED);
    }

    /** DELETE /api/v1/admin/shift-plan/templates/{id} */
    #[Route('/templates/{id}', name: 'admin_shift_templates_delete', methods: ['DELETE'])]
    public function deleteTemplate(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        try { $uuid = Uuid::fromString($id); } catch (\Throwable) {
            return $this->json(['error' => 'Ungültige ID.'], Response::HTTP_BAD_REQUEST);
        }

        $tpl = $this->em->getRepository(ShiftTemplate::class)->find($uuid);
        if ($tpl === null || $tpl->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
            return $this->json(['error' => 'Vorlage nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->em->remove($tpl);
        $this->em->flush();
        return $this->json(['ok' => true]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════════════════════════

    /** GET /api/v1/admin/shift-plan/settings */
    #[Route('/settings', name: 'admin_shift_settings_get', methods: ['GET'])]
    public function getSettings(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $s = $this->findOrCreateSettings($tenant);
        return $this->json($this->serializeSettings($s));
    }

    /** PUT /api/v1/admin/shift-plan/settings */
    #[Route('/settings', name: 'admin_shift_settings_put', methods: ['PUT'])]
    public function saveSettings(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data = json_decode($request->getContent(), true) ?? [];
        $s    = $this->findOrCreateSettings($tenant);

        if (isset($data['overtime_limit'])) {
            $s->setOvertimeLimit((int) $data['overtime_limit']);
        }
        if (isset($data['min_staff']) && is_array($data['min_staff'])) {
            $s->setMinStaff(array_map('intval', $data['min_staff']));
        }
        if (array_key_exists('shift_times', $data)) {
            $s->setShiftTimes(is_array($data['shift_times']) ? $data['shift_times'] : null);
        }
        if (array_key_exists('user_shifts', $data)) {
            $s->setUserShifts(is_array($data['user_shifts']) ? $data['user_shifts'] : null);
        }

        $this->em->flush();
        return $this->json($this->serializeSettings($s));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WAGES
    // ═══════════════════════════════════════════════════════════════════════

    /** GET /api/v1/admin/shift-plan/wages */
    #[Route('/wages', name: 'admin_shift_wages_list', methods: ['GET'])]
    public function listWages(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $list = $this->em->getRepository(ShiftWage::class)->findBy(['tenant' => $tenant]);
        return $this->json(array_map($this->serializeWage(...), $list));
    }

    /** PUT /api/v1/admin/shift-plan/wages/{employeeId} */
    #[Route('/wages/{employeeId}', name: 'admin_shift_wages_upsert', methods: ['PUT'])]
    public function upsertWage(string $employeeId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data = json_decode($request->getContent(), true) ?? [];
        $rate = isset($data['hourly_rate']) ? (float) $data['hourly_rate'] : null;

        if ($rate === null || $rate < 0) {
            return $this->json(['error' => 'hourly_rate erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $wage = $this->em->getRepository(ShiftWage::class)->findOneBy([
            'tenant' => $tenant, 'employeeId' => $employeeId,
        ]);

        if ($rate === 0.0) {
            if ($wage !== null) { $this->em->remove($wage); $this->em->flush(); }
            return $this->json(['ok' => true]);
        }

        if ($wage !== null) {
            $wage->setHourlyRate($rate);
        } else {
            $wage = new ShiftWage($tenant, $employeeId, $rate);
            $this->em->persist($wage);
        }

        $this->em->flush();
        return $this->json($this->serializeWage($wage));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TIME CLOCK (Stempeluhr)
    // ═══════════════════════════════════════════════════════════════════════

    /** POST /api/v1/admin/shift-plan/time-clock/check-in — { employee_id } */
    #[Route('/time-clock/check-in', name: 'admin_time_clock_check_in', methods: ['POST'])]
    public function checkIn(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data       = json_decode($request->getContent(), true) ?? [];
        $employeeId = trim((string) ($data['employee_id'] ?? ''));

        $staff = $this->resolveStaff($employeeId, $tenant);
        if ($staff === null) {
            return $this->json(['error' => 'Mitarbeiter nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }
        if (!$staff->isActive()) {
            return $this->json(['error' => 'Mitarbeiter ist nicht aktiv.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $open = $this->em->getRepository(TimeClockEntry::class)->findOneBy([
            'tenant' => $tenant, 'employeeId' => $employeeId, 'clockOutAt' => null,
        ]);
        if ($open !== null) {
            return $this->json(['error' => 'Bereits eingecheckt.'], Response::HTTP_CONFLICT);
        }

        $entry = new TimeClockEntry($tenant, $employeeId, new \DateTimeImmutable());
        $this->em->persist($entry);
        $this->em->flush();

        return $this->json($this->serializeTimeClockEntry($entry, $staff->getName()), Response::HTTP_CREATED);
    }

    /** POST /api/v1/admin/shift-plan/time-clock/check-out — { employee_id, note? } */
    #[Route('/time-clock/check-out', name: 'admin_time_clock_check_out', methods: ['POST'])]
    public function checkOut(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data       = json_decode($request->getContent(), true) ?? [];
        $employeeId = trim((string) ($data['employee_id'] ?? ''));
        $note       = trim((string) ($data['note'] ?? ''));

        $staff = $this->resolveStaff($employeeId, $tenant);
        if ($staff === null) {
            return $this->json(['error' => 'Mitarbeiter nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $open = $this->em->getRepository(TimeClockEntry::class)->findOneBy([
            'tenant' => $tenant, 'employeeId' => $employeeId, 'clockOutAt' => null,
        ]);
        if ($open === null) {
            return $this->json(['error' => 'Nicht eingecheckt.'], Response::HTTP_CONFLICT);
        }

        $open->clockOut(new \DateTimeImmutable(), $note !== '' ? $note : null);
        $this->em->flush();

        return $this->json($this->serializeTimeClockEntry($open, $staff->getName()));
    }

    /** GET /api/v1/admin/shift-plan/time-clock/live — aktuell eingecheckte Mitarbeiter */
    #[Route('/time-clock/live', name: 'admin_time_clock_live', methods: ['GET'])]
    public function timeClockLive(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $entries = $this->em->getRepository(TimeClockEntry::class)->findBy(
            ['tenant' => $tenant, 'clockOutAt' => null],
            ['clockInAt' => 'ASC'],
        );

        $names = $this->staffNameMap($tenant);

        return $this->json(array_map(
            fn(TimeClockEntry $e) => $this->serializeTimeClockEntry($e, $names[$e->getEmployeeId()] ?? '—'),
            $entries,
        ));
    }

    /** GET /api/v1/admin/shift-plan/time-clock/report?from=YYYY-MM-DD&to=YYYY-MM-DD */
    #[Route('/time-clock/report', name: 'admin_time_clock_report', methods: ['GET'])]
    public function timeClockReport(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $from = $request->query->getString('from');
        $to   = $request->query->getString('to');

        $qb = $this->em->createQueryBuilder()
            ->select('e')->from(TimeClockEntry::class, 'e')
            ->where('e.tenant = :tenant')
            ->setParameter('tenant', $tenant->getId(), UuidType::NAME)
            ->orderBy('e.clockInAt', 'ASC');

        if ($from !== '') {
            try {
                $qb->andWhere('e.clockInAt >= :from')
                   ->setParameter('from', new \DateTimeImmutable($from . ' 00:00:00'), Types::DATETIME_IMMUTABLE);
            } catch (\Exception) {}
        }
        if ($to !== '') {
            try {
                $qb->andWhere('e.clockInAt <= :to')
                   ->setParameter('to', new \DateTimeImmutable($to . ' 23:59:59'), Types::DATETIME_IMMUTABLE);
            } catch (\Exception) {}
        }

        $entries = $qb->getQuery()->getResult();
        $names   = $this->staffNameMap($tenant);

        $summary = []; // employee_id => ['minutes' => int, 'count' => int]
        foreach ($entries as $e) {
            $sum = $summary[$e->getEmployeeId()] ??= ['minutes' => 0, 'count' => 0];
            $summary[$e->getEmployeeId()] = [
                'minutes' => $sum['minutes'] + $this->durationMinutes($e),
                'count'   => $sum['count'] + 1,
            ];
        }

        return $this->json([
            'entries' => array_map(
                fn(TimeClockEntry $e) => $this->serializeTimeClockEntry($e, $names[$e->getEmployeeId()] ?? '—'),
                $entries,
            ),
            'summary' => array_map(
                fn(string $employeeId, array $s) => [
                    'employee_id'   => $employeeId,
                    'employee_name' => $names[$employeeId] ?? '—',
                    'minutes'       => $s['minutes'],
                    'entry_count'   => $s['count'],
                ],
                array_keys($summary),
                array_values($summary),
            ),
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SWAP REQUESTS
    // ═══════════════════════════════════════════════════════════════════════

    /** GET /api/v1/admin/shift-plan/swaps */
    #[Route('/swaps', name: 'admin_shift_swaps_list', methods: ['GET'])]
    public function listSwaps(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $list = $this->em->getRepository(ShiftSwapRequest::class)->findBy(
            ['tenant' => $tenant],
            ['createdAt' => 'DESC'],
        );
        return $this->json(array_map($this->serializeSwap(...), $list));
    }

    /** POST /api/v1/admin/shift-plan/swaps */
    #[Route('/swaps', name: 'admin_shift_swaps_create', methods: ['POST'])]
    public function createSwap(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data = json_decode($request->getContent(), true) ?? [];

        try { $date = new \DateTimeImmutable((string) ($data['date'] ?? '')); }
        catch (\Exception) {
            return $this->json(['error' => 'Ungültiges Datum.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $from = trim((string) ($data['from_employee_id'] ?? ''));
        $to   = trim((string) ($data['to_employee_id']   ?? ''));

        if ($from === '' || $to === '') {
            return $this->json(['error' => 'from_employee_id und to_employee_id erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $note = ($data['note'] ?? '') !== '' ? (string) $data['note'] : null;
        $swap = new ShiftSwapRequest($tenant, $from, $to, $date, $note);
        $this->em->persist($swap);
        $this->em->flush();

        return $this->json($this->serializeSwap($swap), Response::HTTP_CREATED);
    }

    /** PATCH /api/v1/admin/shift-plan/swaps/{id} */
    #[Route('/swaps/{id}', name: 'admin_shift_swaps_update', methods: ['PATCH'])]
    public function updateSwap(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $swap = $this->resolveSwap($id, $tenant);
        if ($swap === null) {
            return $this->json(['error' => 'Anfrage nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $status = trim((string) ($data['status'] ?? ''));
        if (in_array($status, ['pending', 'accepted', 'rejected'], true)) {
            $swap->setStatus($status);
        }

        $this->em->flush();
        return $this->json($this->serializeSwap($swap));
    }

    /** DELETE /api/v1/admin/shift-plan/swaps/{id} */
    #[Route('/swaps/{id}', name: 'admin_shift_swaps_delete', methods: ['DELETE'])]
    public function deleteSwap(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $swap = $this->resolveSwap($id, $tenant);
        if ($swap === null) {
            return $this->json(['error' => 'Anfrage nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->em->remove($swap);
        $this->em->flush();
        return $this->json(['ok' => true]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PDF PER MAIL
    // ═══════════════════════════════════════════════════════════════════════

    /** POST /api/v1/admin/shift-plan/send-pdf — im Browser erzeugtes PDF an Mitarbeiter mailen */
    #[Route('/send-pdf', name: 'admin_shift_plan_send_pdf', methods: ['POST'])]
    public function sendPdf(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $this->requireTenant($user);
        if ($tenant === null) return $this->noTenant();

        $data        = json_decode($request->getContent(), true) ?? [];
        $employeeIds = is_array($data['employee_ids'] ?? null) ? $data['employee_ids'] : [];
        $pdfBase64   = trim((string) ($data['pdf_base64'] ?? ''));
        $weekLabel   = trim((string) ($data['week_label'] ?? ''));
        $fileName    = trim((string) ($data['file_name']  ?? '')) ?: 'Schichtplan.pdf';

        if ($employeeIds === [] || $pdfBase64 === '') {
            return $this->json(['error' => 'employee_ids und pdf_base64 sind erforderlich.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $sent    = [];
        $skipped = [];

        foreach ($employeeIds as $id) {
            try {
                $uuid = Uuid::fromString((string) $id);
            } catch (\Throwable) {
                continue;
            }

            $staff = $this->em->getRepository(Staff::class)->find($uuid);
            if ($staff === null || $staff->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) {
                continue;
            }

            $email = $staff->getEmail();
            if ($email === null || $email === '') {
                $skipped[] = $staff->getName();
                continue;
            }

            $this->bus->dispatch(new SendShiftPlanPdf(
                tenantId:       $tenant->getId()->toRfc4122(),
                recipientEmail: $email,
                recipientName:  $staff->getName(),
                venueName:      $tenant->getName(),
                weekLabel:      $weekLabel,
                pdfBase64:      $pdfBase64,
                fileName:       $fileName,
            ));
            $sent[] = $staff->getName();
        }

        return $this->json(['sent' => $sent, 'skipped' => $skipped]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════════

    private function requireTenant(User $user): ?Tenant
    {
        return $user->getTenant();
    }

    private function noTenant(): JsonResponse
    {
        return $this->json(['error' => 'Kein Tenant.'], Response::HTTP_FORBIDDEN);
    }

    private function findOrCreateSettings(Tenant $tenant): ShiftSettings
    {
        $s = $this->em->getRepository(ShiftSettings::class)->findOneBy(['tenant' => $tenant]);
        if ($s === null) {
            $s = new ShiftSettings($tenant);
            $this->em->persist($s);
        }
        return $s;
    }

    private function resolveShift(string $id, Tenant $tenant): ?ShiftEntry
    {
        try { $uuid = Uuid::fromString($id); } catch (\Throwable) { return null; }
        $s = $this->em->getRepository(ShiftEntry::class)->find($uuid);
        if ($s === null || $s->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) return null;
        return $s;
    }

    private function resolveSwap(string $id, Tenant $tenant): ?ShiftSwapRequest
    {
        try { $uuid = Uuid::fromString($id); } catch (\Throwable) { return null; }
        $s = $this->em->getRepository(ShiftSwapRequest::class)->find($uuid);
        if ($s === null || $s->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) return null;
        return $s;
    }

    private function resolveStaff(string $employeeId, Tenant $tenant): ?Staff
    {
        try { $uuid = Uuid::fromString($employeeId); } catch (\Throwable) { return null; }
        $s = $this->em->getRepository(Staff::class)->find($uuid);
        if ($s === null || $s->getTenant()->getId()->toRfc4122() !== $tenant->getId()->toRfc4122()) return null;
        return $s;
    }

    /** @return array<string, string> employeeId (RFC4122) => Name */
    private function staffNameMap(Tenant $tenant): array
    {
        $map = [];
        foreach ($this->em->getRepository(Staff::class)->findBy(['tenant' => $tenant]) as $s) {
            $map[$s->getId()->toRfc4122()] = $s->getName();
        }
        return $map;
    }

    private function durationMinutes(TimeClockEntry $e): int
    {
        $end = $e->getClockOutAt() ?? new \DateTimeImmutable();
        return (int) round(($end->getTimestamp() - $e->getClockInAt()->getTimestamp()) / 60);
    }

    private function serializeShift(ShiftEntry $s): array
    {
        return [
            'id'          => $s->getId()->toRfc4122(),
            'employee_id' => $s->getEmployeeId(),
            'date'        => $s->getDate()->format('Y-m-d'),
            'type'        => $s->getType(),
            'start_time'  => $s->getStartTime(),
            'end_time'    => $s->getEndTime(),
            'note'        => $s->getNote() ?? '',
        ];
    }

    private function serializeAvail(ShiftAvailability $a): array
    {
        return [
            'id'          => $a->getId()->toRfc4122(),
            'employee_id' => $a->getEmployeeId(),
            'weekday'     => $a->getWeekday(),
            'type'        => $a->getType(),
        ];
    }

    private function serializeTemplate(ShiftTemplate $t): array
    {
        return [
            'id'      => $t->getId()->toRfc4122(),
            'name'    => $t->getName(),
            'entries' => $t->getEntries(),
        ];
    }

    private function serializeSettings(ShiftSettings $s): array
    {
        return [
            'overtime_limit' => $s->getOvertimeLimit(),
            'min_staff'      => $s->getMinStaff(),
            'shift_times'    => $s->getShiftTimes(),
            'user_shifts'    => $s->getUserShifts(),
        ];
    }

    private function serializeWage(ShiftWage $w): array
    {
        return [
            'id'          => $w->getId()->toRfc4122(),
            'employee_id' => $w->getEmployeeId(),
            'hourly_rate' => $w->getHourlyRate(),
        ];
    }

    private function serializeTimeClockEntry(TimeClockEntry $e, string $employeeName): array
    {
        return [
            'id'             => $e->getId()->toRfc4122(),
            'employee_id'    => $e->getEmployeeId(),
            'employee_name'  => $employeeName,
            'clock_in_at'    => $e->getClockInAt()->format(\DateTimeInterface::ATOM),
            'clock_out_at'   => $e->getClockOutAt()?->format(\DateTimeInterface::ATOM),
            'note'           => $e->getNote() ?? '',
            'duration_minutes' => $this->durationMinutes($e),
            'open'           => $e->isOpen(),
        ];
    }

    private function serializeSwap(ShiftSwapRequest $r): array
    {
        return [
            'id'               => $r->getId()->toRfc4122(),
            'from_employee_id' => $r->getFromEmployeeId(),
            'to_employee_id'   => $r->getToEmployeeId(),
            'date'             => $r->getDate()->format('Y-m-d'),
            'status'           => $r->getStatus(),
            'note'             => $r->getNote() ?? '',
            'created_at'       => $r->getCreatedAt()->getTimestamp() * 1000,
        ];
    }
}
