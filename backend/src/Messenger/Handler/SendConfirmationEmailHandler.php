<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendConfirmationEmail;
use Symfony\Bridge\Twig\Mime\TemplatedEmail;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Address;

/**
 * Verschickt die Bestätigungsmail an den Gast.
 * Läuft im messenger_worker-Container (Warteschlange "async").
 */
#[AsMessageHandler]
final readonly class SendConfirmationEmailHandler
{
    public function __construct(
        private MailerInterface $mailer,
        #[Autowire('%env(MAILER_FROM)%')]
        private string $mailerFrom,
        #[Autowire('%widget_base_url%')]
        private string $widgetBaseUrl,
    ) {}

    public function __invoke(SendConfirmationEmail $message): void
    {
        $email = (new TemplatedEmail())
            ->from(Address::create($this->mailerFrom))
            ->to(new Address($message->guestEmail, $message->guestName))
            ->subject(sprintf('Ihre Reservierung bei %s ist bestätigt', $message->venueName))
            ->htmlTemplate('email/reservation_confirmed.html.twig')
            ->context([
                'guest_name' => $message->guestName,
                'venue_name' => $message->venueName,
                'starts_at'  => $this->formatDate($message->startsAt),
                'party_size' => $message->partySize,
                'cancel_url' => $this->cancelUrl($message->reservationToken),
            ]);

        $this->mailer->send($email);
    }

    /** "2026-11-05T19:30:00+01:00" → "05.11.2026, 19:30 Uhr" */
    private function formatDate(string $startsAt): string
    {
        try {
            return (new \DateTimeImmutable($startsAt))->format('d.m.Y, H:i') . ' Uhr';
        } catch (\Exception) {
            return $startsAt; // unbekanntes Format: so anzeigen, wie es kommt
        }
    }

    /** Link zur Storno-Seite im Widget */
    private function cancelUrl(string $token): string
    {
        return rtrim($this->widgetBaseUrl, '/') . '/reservierung/' . rawurlencode($token) . '/stornieren';
    }
}
