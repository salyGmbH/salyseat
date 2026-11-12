<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Payment\Domain\Gateway\PaymentGatewayInterface;
use App\Module\Reservation\Domain\Entity\Reservation;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Stripe-Zahlungsaktionen für Admin-Nutzer.
 *
 * POST /api/v1/admin/reservations/{id}/payment/capture  → Betrag einziehen (No-Show)
 * POST /api/v1/admin/reservations/{id}/payment/release  → Autorisierung freigeben (Gast erschienen)
 */
#[Route('/reservations/{id}/payment')]
class ReservationPaymentController extends AbstractController
{
    public function __construct(
        private readonly PaymentGatewayInterface $payment,
        private readonly EntityManagerInterface  $em,
    ) {}

    #[Route('/capture', name: 'admin_reservation_payment_capture', methods: ['POST'])]
    public function capture(string $id): JsonResponse
    {
        $reservation = $this->findReservation($id);
        if (!$reservation) {
            return $this->json(['error' => 'Reservierung nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $intentId = $reservation->getPaymentIntentId();
        if (!$intentId || $reservation->getPaymentStatus() !== 'authorized') {
            return $this->json(['error' => 'Keine autorisierte Zahlung vorhanden.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $this->payment->capturePayment($intentId);
        } catch (\Throwable) {
            return $this->json(['error' => 'Betrag konnte nicht eingezogen werden.'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $reservation->markPaymentCaptured();
        $this->em->flush();

        return $this->json(['status' => 'captured']);
    }

    #[Route('/release', name: 'admin_reservation_payment_release', methods: ['POST'])]
    public function release(string $id): JsonResponse
    {
        $reservation = $this->findReservation($id);
        if (!$reservation) {
            return $this->json(['error' => 'Reservierung nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $intentId = $reservation->getPaymentIntentId();
        if (!$intentId || $reservation->getPaymentStatus() !== 'authorized') {
            return $this->json(['error' => 'Keine autorisierte Zahlung vorhanden.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $this->payment->releasePayment($intentId);
        } catch (\Throwable) {
            return $this->json(['error' => 'Freigabe fehlgeschlagen.'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $reservation->markPaymentReleased();
        $this->em->flush();

        return $this->json(['status' => 'released']);
    }

    private function findReservation(string $id): ?Reservation
    {
        try {
            $uuid = Uuid::fromString($id);
        } catch (\InvalidArgumentException) {
            return null;
        }
        return $this->em->getRepository(Reservation::class)->find($uuid);
    }
}