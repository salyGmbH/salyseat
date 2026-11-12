<?php

declare(strict_types=1);

namespace App\Module\Payment\Infrastructure\Stripe;

use App\Module\Payment\Domain\Gateway\PaymentGatewayInterface;
use Stripe\StripeClient;
use Stripe\Webhook;

final class StripeGateway implements PaymentGatewayInterface
{
    private readonly StripeClient $client;

    public function __construct(
        private readonly string $stripeSecretKey,
        private readonly string $stripeWebhookSecret,
    ) {
        $this->client = new StripeClient($stripeSecretKey);
    }

    public function createPaymentIntent(
        int    $amountCents,
        string $currency,
        string $description,
        array  $metadata = [],
        bool   $captureImmediately = true,
    ): array {
        $params = [
            'amount'               => $amountCents,
            'currency'             => $currency,
            'description'          => $description,
            'metadata'             => $metadata,
            'payment_method_types' => ['card'],
        ];
        if (!$captureImmediately) {
            $params['capture_method'] = 'manual';
        }
        $intent = $this->client->paymentIntents->create($params);

        return [
            'intentId'     => $intent->id,
            'clientSecret' => $intent->client_secret,
        ];
    }

    public function capturePayment(string $intentId): void
    {
        $this->client->paymentIntents->capture($intentId);
    }

    public function releasePayment(string $intentId): void
    {
        $this->client->paymentIntents->cancel($intentId);
    }

    public function constructWebhookEvent(string $payload, string $sigHeader): object
    {
        return Webhook::constructEvent($payload, $sigHeader, $this->stripeWebhookSecret);
    }
}