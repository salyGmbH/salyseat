<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Admin API für Reservierungsverwaltung.
 * JWT-geschützt — nur für eingeloggte Tenant-Admins.
 */
#[Route('/reservations')]
class ReservationController extends AbstractController
{
    /**
     * Liste aller Reservierungen des Tenants.
     * GET /api/v1/admin/reservations?date=2026-11-05&status=confirmed
     */
    #[Route('', name: 'admin_reservation_list', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        // TODO: ListReservationsQuery mit Tenant-Filter
        return $this->json(['reservations' => [], 'total' => 0]);
    }

    /**
     * Einzelne Reservierung.
     * GET /api/v1/admin/reservations/{id}
     */
    #[Route('/{id}', name: 'admin_reservation_get', methods: ['GET'])]
    public function get(string $id): JsonResponse
    {
        // TODO: GetReservationQuery
        return $this->json([]);
    }

    /**
     * Reservierung bestätigen.
     * PATCH /api/v1/admin/reservations/{id}/confirm
     */
    #[Route('/{id}/confirm', name: 'admin_reservation_confirm', methods: ['PATCH'])]
    public function confirm(string $id): JsonResponse
    {
        // TODO: ConfirmReservationCommand
        return $this->json(['status' => 'confirmed']);
    }

    /**
     * Als No-Show markieren.
     * PATCH /api/v1/admin/reservations/{id}/no-show
     */
    #[Route('/{id}/no-show', name: 'admin_reservation_noshow', methods: ['PATCH'])]
    public function noShow(string $id): JsonResponse
    {
        // TODO: MarkNoShowCommand
        return $this->json(['status' => 'no_show']);
    }
}
