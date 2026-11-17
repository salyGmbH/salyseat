<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Messenger\Message\SendVoucherEmail;
use App\Module\User\Domain\Entity\User;
use App\Module\Voucher\Domain\Entity\Voucher;
use App\Module\Voucher\Domain\Entity\VoucherImage;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherConfigRepository;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherImageRepository;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/vouchers')]
class VoucherController extends AbstractController
{
    /** Statische Zahlungsmethoden-Definitionen (nur active-Status ist per Tenant dynamisch). */
    private const PAYMENT_METHODS = [
        ['id' => 'card',       'name' => 'Kreditkarte',       'provider' => 'stripe',  'icon' => 'credit_card',           'description' => 'Visa, Mastercard, American Express — sicher via Stripe.'],
        ['id' => 'apple_pay',  'name' => 'Apple Pay',          'provider' => 'stripe',  'icon' => 'phone_iphone',          'description' => 'Für iPhone & Mac — One-Touch-Zahlung via Stripe.'],
        ['id' => 'google_pay', 'name' => 'Google Pay',         'provider' => 'stripe',  'icon' => 'smartphone',            'description' => 'Für Android-Geräte — schnelle Zahlung via Stripe.'],
        ['id' => 'paypal',     'name' => 'PayPal',             'provider' => 'paypal',  'icon' => 'account_balance_wallet','description' => 'Meistgenutzter Online-Bezahldienst in Deutschland.'],
        ['id' => 'sofort',     'name' => 'SOFORT / Klarna',    'provider' => 'sofort',  'icon' => 'account_balance',       'description' => 'Direkte Banküberweisung in Echtzeit — sehr beliebt im DACH-Raum.'],
        ['id' => 'invoice',    'name' => 'Auf Rechnung',       'provider' => 'manual',  'icon' => 'receipt_long',          'description' => 'Zahlung per SEPA-Überweisung nach Rechnungserhalt.'],
    ];

    public function __construct(
        private readonly DoctrineVoucherRepository       $repo,
        private readonly DoctrineVoucherImageRepository  $imageRepo,
        private readonly DoctrineVoucherConfigRepository $configRepo,
        private readonly MessageBusInterface             $bus,
    ) {}

    // ── Gutscheine ─────────────────────────────────────────────────────────────

    #[Route('', name: 'admin_vouchers_list', methods: ['GET'])]
    public function list(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        return $this->json(array_map(
            fn(Voucher $v) => $this->serializeVoucher($v),
            $this->repo->findByTenant($tenant),
        ));
    }

    #[Route('', name: 'admin_vouchers_create', methods: ['POST'])]
    public function create(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        $amount        = (float) ($data['amount'] ?? 0);
        $recipientName = trim((string) ($data['recipientName'] ?? ''));
        $expiresAt     = trim((string) ($data['expiresAt'] ?? ''));

        if ($amount <= 0 || $recipientName === '' || $expiresAt === '') {
            return $this->json(['error' => 'amount, recipientName und expiresAt sind Pflichtfelder.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $code = $this->generateUniqueCode();

        $voucher = new Voucher(
            $tenant,
            $code,
            $amount,
            'Manuell',
            $recipientName,
            new \DateTimeImmutable($expiresAt),
        );
        $voucher->setRecipientEmail(($data['recipientEmail'] ?? '') !== '' ? trim((string) $data['recipientEmail']) : null);
        $voucher->setMessage(($data['message'] ?? '') !== '' ? trim((string) $data['message']) : null);

        $this->repo->save($voucher);

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

        return $this->json($this->serializeVoucher($voucher), Response::HTTP_CREATED);
    }

    #[Route('/code/{code}', name: 'admin_vouchers_lookup', methods: ['GET'])]
    public function lookupByCode(string $code, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $voucher = $this->repo->findByCodeAndTenant($code, $tenant);
        if ($voucher === null) {
            return $this->json(['error' => 'Gutschein nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serializeVoucher($voucher));
    }

    #[Route('/{id}/redeem', name: 'admin_vouchers_redeem', methods: ['PUT'])]
    public function redeem(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $voucher = $this->repo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($voucher === null) {
            return $this->json(['error' => 'Gutschein nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        if ($voucher->getStatus() !== 'active') {
            return $this->json(['error' => 'Gutschein ist nicht mehr einlösbar.'], Response::HTTP_CONFLICT);
        }

        $voucher->redeem();
        $this->repo->save($voucher);

        return $this->json($this->serializeVoucher($voucher));
    }

    #[Route('/{id}', name: 'admin_vouchers_delete', methods: ['DELETE'])]
    public function delete(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $voucher = $this->repo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($voucher === null) {
            return $this->json(['error' => 'Gutschein nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->repo->delete($voucher);

        return $this->json(['ok' => true]);
    }

    // ── Bilder ─────────────────────────────────────────────────────────────────

    #[Route('/images', name: 'admin_vouchers_images_list', methods: ['GET'])]
    public function listImages(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        return $this->json(array_map(
            fn(VoucherImage $i) => $this->serializeImage($i),
            $this->imageRepo->findByTenant($tenant),
        ));
    }

    #[Route('/images', name: 'admin_vouchers_images_add', methods: ['POST'])]
    public function addImage(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string) ($data['name'] ?? ''));
        $url  = trim((string) ($data['url'] ?? ''));

        if ($name === '' || $url === '') {
            return $this->json(['error' => 'name und url sind Pflichtfelder.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $image = new VoucherImage($tenant, $name, $url);
        $this->imageRepo->save($image);

        return $this->json($this->serializeImage($image), Response::HTTP_CREATED);
    }

    #[Route('/images/{id}/toggle', name: 'admin_vouchers_images_toggle', methods: ['PATCH'])]
    public function toggleImage(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $image = $this->imageRepo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($image === null) {
            return $this->json(['error' => 'Bild nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $image->toggle();
        $this->imageRepo->save($image);

        return $this->json($this->serializeImage($image));
    }

    #[Route('/images/{id}', name: 'admin_vouchers_images_delete', methods: ['DELETE'])]
    public function deleteImage(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $image = $this->imageRepo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($image === null) {
            return $this->json(['error' => 'Bild nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->imageRepo->delete($image);

        return $this->json(['ok' => true]);
    }

    // ── Postversand-Konfiguration ──────────────────────────────────────────────

    #[Route('/postal-config', name: 'admin_vouchers_postal_config_get', methods: ['GET'])]
    public function getPostalConfig(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $config = $this->configRepo->findOrCreateByTenant($tenant);

        return $this->json([
            'postalEnabled'      => $config->isPostalEnabled(),
            'postalShippingCost' => $config->getPostalShippingCost(),
        ]);
    }

    #[Route('/postal-config', name: 'admin_vouchers_postal_config_patch', methods: ['PATCH'])]
    public function patchPostalConfig(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $data   = json_decode($request->getContent(), true) ?? [];
        $config = $this->configRepo->findOrCreateByTenant($tenant);

        if (array_key_exists('postalEnabled', $data)) {
            $config->setPostalEnabled((bool) $data['postalEnabled']);
        }
        if (array_key_exists('postalShippingCost', $data)) {
            $cost = $data['postalShippingCost'] !== null ? (float) $data['postalShippingCost'] : null;
            $config->setPostalShippingCost($cost !== null && $cost >= 0 ? $cost : null);
        }

        $this->configRepo->save($config);

        return $this->json([
            'postalEnabled'      => $config->isPostalEnabled(),
            'postalShippingCost' => $config->getPostalShippingCost(),
        ]);
    }

    // ── Zahlungsmethoden ───────────────────────────────────────────────────────

    #[Route('/payment-methods', name: 'admin_vouchers_payment_methods_list', methods: ['GET'])]
    public function listPaymentMethods(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $config  = $this->configRepo->findOrCreateByTenant($tenant);
        $active  = $config->getActivePaymentMethods();

        $methods = array_map(
            fn(array $m) => [...$m, 'active' => in_array($m['id'], $active, true)],
            self::PAYMENT_METHODS,
        );

        return $this->json($methods);
    }

    #[Route('/payment-methods/{id}/toggle', name: 'admin_vouchers_payment_methods_toggle', methods: ['PATCH'])]
    public function togglePaymentMethod(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $validIds = array_column(self::PAYMENT_METHODS, 'id');
        if (!in_array($id, $validIds, true)) {
            return $this->json(['error' => 'Unbekannte Zahlungsmethode.'], Response::HTTP_NOT_FOUND);
        }

        $config = $this->configRepo->findOrCreateByTenant($tenant);
        $config->togglePaymentMethod($id);
        $this->configRepo->save($config);

        $active = $config->getActivePaymentMethods();
        $method = array_values(array_filter(self::PAYMENT_METHODS, fn($m) => $m['id'] === $id))[0];

        return $this->json([...$method, 'active' => in_array($id, $active, true)]);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    #[Route('/{id}/mark-shipped', name: 'admin_vouchers_mark_shipped', methods: ['PATCH'])]
    public function markShipped(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $voucher = $this->repo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($voucher === null) {
            return $this->json(['error' => 'Gutschein nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $voucher->setDeliveryMethod('post_shipped');
        $this->repo->save($voucher);

        return $this->json($this->serializeVoucher($voucher));
    }

    private function serializeVoucher(Voucher $v): array
    {
        return [
            'id'              => $v->getId()->toRfc4122(),
            'code'            => $v->getCode(),
            'amount'          => $v->getAmount(),
            'remainingAmount' => $v->getRemainingAmount(),
            'buyerName'       => $v->getBuyerName(),
            'buyerEmail'      => $v->getBuyerEmail() ?? '',
            'recipientName'   => $v->getRecipientName(),
            'recipientEmail'  => $v->getRecipientEmail() ?? '',
            'message'         => $v->getMessage() ?? '',
            'status'          => $v->getStatus(),
            'deliveryMethod'  => $v->getDeliveryMethod(),
            'postalAddress'   => $v->getPostalAddress(),
            'expiresAt'       => $v->getExpiresAt()->format('Y-m-d'),
            'createdAt'       => $v->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'redeemedAt'      => $v->getRedeemedAt()?->format(\DateTimeInterface::ATOM),
        ];
    }

    private function serializeImage(VoucherImage $i): array
    {
        return [
            'id'     => $i->getId()->toRfc4122(),
            'name'   => $i->getName(),
            'url'    => $i->getUrl(),
            'active' => $i->isActive(),
        ];
    }

    private function generateUniqueCode(): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $rand = fn() => $chars[random_int(0, strlen($chars) - 1)];
            $code = sprintf('SALY-%s%s%s%s-%s%s%s%s',
                $rand(), $rand(), $rand(), $rand(),
                $rand(), $rand(), $rand(), $rand(),
            );
        } while ($this->repo->codeExistsAnywhere($code));

        return $code;
    }
}
