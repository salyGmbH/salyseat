<?php

declare(strict_types=1);

namespace App\Module\Payment\Domain\Gateway;

interface PaymentGatewayInterface
{
    /**
     * Erstellt einen PaymentIntent und gibt das Client Secret zurück.
     *
     * @param int    $amountCents  Betrag in Cent (z. B. 1000 = 10,00 €)
     * @param string $currency     ISO-4217 (z. B. 'eur')
     * @param string $description  Interne Beschreibung (erscheint im Stripe-Dashboard)
     * @param array  $metadata     Schlüssel-Wert-Paare für Stripe-Metadaten
     *
     * @return array{intentId: string, clientSecret: string}
     */
    /**
     * @return array{intentId: string, clientSecret: string}
     */
    public function createPaymentIntent(
        int    $amountCents,
        string $currency,
        string $description,
        array  $metadata = [],
        bool   $captureImmediately = true,
    ): array;

    /** Zieht einen zuvor autorisierten Betrag ein. */
    public function capturePayment(string $intentId): void;

    /** Gibt eine Autorisierung frei (kein Geld wird eingezogen). */
    public function releasePayment(string $intentId): void;

    /**
     * Verifiziert die Stripe-Webhook-Signatur und gibt das Event zurück.
     *
     * @throws \UnexpectedValueException  Payload ungültig
     * @throws \Stripe\Exception\SignatureVerificationException  Signatur falsch
     */
    public function constructWebhookEvent(string $payload, string $sigHeader): object;
}