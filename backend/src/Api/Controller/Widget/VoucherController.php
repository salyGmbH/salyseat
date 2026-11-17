<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Messenger\Message\SendVoucherEmail;
use App\Module\Payment\Domain\Gateway\PaymentGatewayInterface;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\Voucher\Domain\Entity\Voucher;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherConfigRepository;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherImageRepository;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/vouchers')]
class VoucherController extends AbstractController
{
    private const STRIPE_METHODS = ['card', 'apple_pay', 'google_pay'];
    private const CURRENCY       = 'eur';

    public function __construct(
        private readonly DoctrineTenantRepository        $tenants,
        private readonly DoctrineVoucherRepository       $repo,
        private readonly DoctrineVoucherImageRepository  $imageRepo,
        private readonly DoctrineVoucherConfigRepository $configRepo,
        private readonly PaymentGatewayInterface         $payment,
        private readonly EntityManagerInterface          $em,
        private readonly MessageBusInterface             $bus,
    ) {}

    /**
     * GET /api/v1/widget/vouchers/config/{key}
     * Gibt Design-Einstellungen + Restaurantname zurück — kein Auth nötig.
     */
    #[Route('/config/{key}', name: 'widget_voucher_config', methods: ['GET'])]
    public function config(string $key): JsonResponse
    {
        $tenant = $this->tenants->findByPublicKey($key);

        if ($tenant === null || !$tenant->isActive()) {
            return $this->json(['error' => 'Restaurant nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $uiSettings    = $tenant->getUiSettings() ?? [];
        $voucherConfig = $this->configRepo->findOrCreateByTenant($tenant);
        $activeMethods = array_values(array_filter(
            $voucherConfig->getActivePaymentMethods(),
            fn ($m) => in_array($m, self::STRIPE_METHODS, true),
        ));

        return $this->json([
            'restaurantName'       => $tenant->getName(),
            'gutscheinDesign'      => $uiSettings['gutscheinDesign'] ?? null,
            'stripePublishableKey' => $uiSettings['stripeSettings']['publishableKey'] ?? null,
            'activePaymentMethods' => $activeMethods,
            'postalEnabled'        => $voucherConfig->isPostalEnabled(),
            'postalShippingCost'   => $voucherConfig->getPostalShippingCost(),
        ]);
    }

    /**
     * GET /api/v1/widget/vouchers/images?key=...
     * Gibt aktive Gutschein-Design-Bilder zurück — kein Auth nötig.
     */
    #[Route('/images', name: 'widget_voucher_images', methods: ['GET'])]
    public function images(Request $request): JsonResponse
    {
        $key    = $request->query->get('key', '');
        $tenant = $this->tenants->findByPublicKey($key);

        if ($tenant === null || !$tenant->isActive()) {
            return $this->json([], Response::HTTP_OK);
        }

        $images = $this->imageRepo->findByTenant($tenant);

        return $this->json(array_values(array_filter(
            array_map(fn ($i) => $i->isActive() ? [
                'id'     => $i->getId()->toRfc4122(),
                'name'   => $i->getName(),
                'url'    => $i->getUrl(),
                'active' => $i->isActive(),
            ] : null, $images),
        )));
    }

    /**
     * POST /api/v1/widget/vouchers/purchase?key=...
     * Erstellt einen Gutschein über das Widget — kein Auth nötig.
     */
    #[Route('/purchase', name: 'widget_voucher_purchase', methods: ['POST'])]
    public function purchase(Request $request): JsonResponse
    {
        $key    = $request->query->get('key', '');
        $tenant = $this->tenants->findByPublicKey($key);

        if ($tenant === null || !$tenant->isActive()) {
            return $this->json(['error' => 'Restaurant nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        $amount        = isset($data['amount'])        ? (float) $data['amount']        : 0.0;
        $recipientName = trim((string) ($data['recipientName'] ?? ''));
        $buyerName     = trim((string) ($data['buyerName']     ?? ''));
        $buyerEmail    = trim((string) ($data['buyerEmail']    ?? ''));

        if ($amount <= 0 || $recipientName === '' || $buyerName === '' || $buyerEmail === '') {
            return $this->json(['error' => 'Pflichtfelder fehlen.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $expiresAt = new \DateTimeImmutable('+1 year');
        $code      = $this->generateUniqueCode();

        $deliveryMethod = in_array($data['deliveryMethod'] ?? '', ['email', 'post'], true)
            ? $data['deliveryMethod']
            : 'email';

        $voucher = new Voucher($tenant, $code, $amount, $buyerName, $recipientName, $expiresAt);
        $voucher->setBuyerEmail($buyerEmail ?: null);
        $voucher->setRecipientEmail(trim((string) ($data['recipientEmail'] ?? '')) ?: null);
        $voucher->setMessage(trim((string) ($data['message'] ?? '')) ?: null);
        $voucher->setDeliveryMethod($deliveryMethod);

        if ($deliveryMethod === 'post' && isset($data['postalAddress']) && is_array($data['postalAddress'])) {
            $addr = $data['postalAddress'];
            $voucher->setPostalAddress([
                'name'    => trim((string) ($addr['name']    ?? '')),
                'street'  => trim((string) ($addr['street']  ?? '')),
                'zip'     => trim((string) ($addr['zip']     ?? '')),
                'city'    => trim((string) ($addr['city']    ?? '')),
                'country' => trim((string) ($addr['country'] ?? 'Deutschland')),
            ]);
        }

        $this->em->persist($voucher);
        $this->em->flush();

        $recipientEmail = $voucher->getRecipientEmail();
        if ($recipientEmail !== null) {
            $this->bus->dispatch(new SendVoucherEmail(
                voucherId:      $voucher->getId()->toRfc4122(),
                code:           $voucher->getCode(),
                amount:         $voucher->getAmount(),
                recipientName:  $voucher->getRecipientName(),
                recipientEmail: $recipientEmail,
                buyerName:      $voucher->getBuyerName(),
                expiresAt:      $voucher->getExpiresAt()->format('d.m.Y'),
                venueName:      $tenant->getName(),
                tenantId:       $tenant->getId()->toRfc4122(),
                message:        $voucher->getMessage(),
            ));
        }

        return $this->json([
            'code'          => $voucher->getCode(),
            'amount'        => $voucher->getAmount(),
            'recipientName' => $voucher->getRecipientName(),
            'expiresAt'     => $voucher->getExpiresAt()->format('Y-m-d'),
        ], Response::HTTP_CREATED);
    }

    /**
     * POST /api/v1/widget/vouchers/payment-intent?key=...
     * Erstellt einen Stripe PaymentIntent für einen Gutschein-Kauf.
     */
    #[Route('/payment-intent', name: 'widget_voucher_payment_intent', methods: ['POST'])]
    public function paymentIntent(Request $request): JsonResponse
    {
        $key    = $request->query->get('key', '');
        $tenant = $this->tenants->findByPublicKey($key);

        if ($tenant === null || !$tenant->isActive()) {
            return $this->json(['error' => 'Restaurant nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data        = json_decode($request->getContent(), true) ?? [];
        $amountCents = (int) ($data['amount_cents'] ?? 0);

        if ($amountCents < 50) {
            return $this->json(['error' => 'Betrag zu gering.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $result = $this->payment->createPaymentIntent(
                amountCents: $amountCents,
                currency:    self::CURRENCY,
                description: sprintf('Gutschein — %s', $tenant->getName()),
                metadata:    ['tenant_id' => $tenant->getId()->toRfc4122(), 'type' => 'voucher'],
            );
        } catch (\Throwable) {
            return $this->json(
                ['error' => 'Zahlung konnte nicht initialisiert werden.'],
                Response::HTTP_INTERNAL_SERVER_ERROR,
            );
        }

        return $this->json([
            'client_secret' => $result['clientSecret'],
            'amount_cents'  => $amountCents,
            'currency'      => self::CURRENCY,
        ]);
    }

    private function generateUniqueCode(): string
    {
        do {
            $part1 = strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
            $part2 = strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
            $code  = "LYDR-{$part1}-{$part2}";
        } while ($this->repo->codeExistsAnywhere($code));

        return $code;
    }
}
