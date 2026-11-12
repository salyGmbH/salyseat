<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Payment\Domain\Gateway\PaymentGatewayInterface;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * POST /api/v1/widget/payment-intent
 *
 * Erstellt einen Stripe PaymentIntent für eine bestehende Reservierung.
 * Gibt den client_secret zurück, den das Widget an Stripe.js übergibt.
 * Öffentlich — gesichert über den Reservierungs-Token.
 */
#[Route('/payment-intent')]
class PaymentIntentController extends AbstractController
{
    private const DEFAULT_AMOUNT_CENTS = 1000;  // 10,00 €
    private const CURRENCY             = 'eur';

    public function __construct(
        private readonly PaymentGatewayInterface $payment,
        private readonly EntityManagerInterface  $em,
    ) {}

    #[Route('', name: 'widget_payment_intent_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data  = json_decode($request->getContent(), true) ?? [];
        $token = $data['reservation_token'] ?? null;
        $mode  = ($data['mode'] ?? 'charge') === 'authorize' ? 'authorize' : 'charge';

        if (!$token || !is_string($token)) {
            return $this->json(['error' => 'reservation_token fehlt.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $reservation = $this->em->getRepository(Reservation::class)
            ->findOneBy(['token' => $token]);

        if ($reservation === null) {
            return $this->json(['error' => 'Reservierung nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $tenant = $reservation->getVenue()->getTenant();

        // Betrag: bei No-Show-Schutz aus noShowBetragCents, sonst zahlungBetragCents
        $amountCents = $mode === 'authorize'
            ? $this->resolveNoShowAmount($tenant)
            : $this->resolveAmount($tenant);

        $captureImmediately = $mode !== 'authorize';

        try {
            $result = $this->payment->createPaymentIntent(
                amountCents:       $amountCents,
                currency:          self::CURRENCY,
                captureImmediately: $captureImmediately,
                description: sprintf(
                    'Reservierung %s — %s (%d Pers.) am %s',
                    $reservation->getToken(),
                    $reservation->getGuestName(),
                    $reservation->getPartySize(),
                    $reservation->getStartsAt()->format('d.m.Y H:i'),
                ),
                metadata: [
                    'reservation_token' => $reservation->getToken(),
                    'reservation_id'    => $reservation->getId()->toRfc4122(),
                    'tenant_id'         => $tenant->getId()->toRfc4122(),
                ],
            );
        } catch (\Throwable $e) {
            return $this->json(
                ['error' => 'Zahlung konnte nicht initialisiert werden. Bitte erneut versuchen.'],
                Response::HTTP_INTERNAL_SERVER_ERROR,
            );
        }

        $reservation->setPaymentIntent($result['intentId'], $captureImmediately ? 'automatic' : 'manual');
        $this->em->flush();

        return $this->json([
            'client_secret' => $result['clientSecret'],
            'amount_cents'  => $amountCents,
            'currency'      => self::CURRENCY,
        ]);
    }

    private function resolveAmount(Tenant $tenant): int
    {
        $settings    = $tenant->getUiSettings() ?? [];
        $amountCents = (int) ($settings['widgetFunctional']['zahlungBetragCents'] ?? 0);
        return $amountCents > 0 ? $amountCents : self::DEFAULT_AMOUNT_CENTS;
    }

    private function resolveNoShowAmount(Tenant $tenant): int
    {
        $settings    = $tenant->getUiSettings() ?? [];
        $amountCents = (int) ($settings['widgetFunctional']['noShowBetragCents'] ?? 0);
        return $amountCents > 0 ? $amountCents : self::DEFAULT_AMOUNT_CENTS;
    }
}