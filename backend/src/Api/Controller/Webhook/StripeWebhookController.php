<?php

declare(strict_types=1);

namespace App\Api\Controller\Webhook;

use App\Module\Payment\Domain\Gateway\PaymentGatewayInterface;
use App\Module\Reservation\Domain\Entity\Reservation;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * POST /api/v1/webhook/stripe
 *
 * Empfängt Stripe-Webhook-Events, verifiziert die Signatur und
 * aktualisiert den Zahlungsstatus der Reservierung.
 * Öffentlich — gesichert durch Stripe-Signaturprüfung (STRIPE_WEBHOOK_SECRET).
 */
#[Route('/api/v1/webhook/stripe', name: 'webhook_stripe', methods: ['POST'])]
class StripeWebhookController extends AbstractController
{
    public function __construct(
        private readonly PaymentGatewayInterface $payment,
        private readonly EntityManagerInterface  $em,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $payload   = $request->getContent();
        $sigHeader = $request->headers->get('Stripe-Signature', '');

        try {
            $event = $this->payment->constructWebhookEvent($payload, $sigHeader);
        } catch (\Throwable) {
            return $this->json(['error' => 'Webhook-Signatur ungültig.'], Response::HTTP_BAD_REQUEST);
        }

        $intent = $event->data->object ?? null;

        match ($event->type) {
            'payment_intent.succeeded'                => $this->handleSucceeded($intent),
            'payment_intent.amount_capturable_updated'=> $this->handleAuthorized($intent),
            'payment_intent.payment_failed'           => $this->handleFailed($intent),
            'charge.refunded'                         => $this->handleRefunded($intent),
            default                                   => null,
        };

        return $this->json(['received' => true]);
    }

    private function findReservation(object $intent): ?Reservation
    {
        $token = $intent->metadata['reservation_token'] ?? null;
        if (!$token) return null;

        return $this->em->getRepository(Reservation::class)->findOneBy(['token' => $token]);
    }

    private function handleSucceeded(object $intent): void
    {
        $reservation = $this->findReservation($intent);
        if (!$reservation) return;

        $reservation->markPaymentPaid();

        // Reservierung automatisch bestätigen wenn sie noch pending ist
        if ($reservation->isPending()) {
            $reservation->confirm();
        }

        $this->em->flush();
    }

    private function handleAuthorized(object $intent): void
    {
        $reservation = $this->findReservation($intent);
        if (!$reservation) return;

        $reservation->markPaymentAuthorized();
        $this->em->flush();
    }

    private function handleFailed(object $intent): void
    {
        $reservation = $this->findReservation($intent);
        if (!$reservation) return;

        $reservation->markPaymentFailed();
        $this->em->flush();
    }

    private function handleRefunded(object $charge): void
    {
        // charge.refunded hat keine reservation_token metadata — über payment_intent_id suchen
        $intentId = $charge->payment_intent ?? null;
        if (!$intentId) return;

        $reservation = $this->em->getRepository(Reservation::class)
            ->findOneBy(['paymentIntentId' => $intentId]);

        if (!$reservation) return;

        $reservation->markPaymentRefunded();
        $this->em->flush();
    }
}
