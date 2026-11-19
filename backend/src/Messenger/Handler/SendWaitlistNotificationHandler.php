<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendWaitlistNotification;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;

/**
 * Informiert das Restaurant per E-Mail über einen neuen Warteliste-Eintrag.
 * Bewusst ohne TenantEmailSettingsProvider/Branding — das ist eine interne
 * Betriebs-Benachrichtigung ans Personal, keine gast-seitige Mail.
 */
#[AsMessageHandler]
final class SendWaitlistNotificationHandler
{
    public function __construct(
        private readonly MailerInterface  $mailer,
        private readonly LoggerInterface  $logger,
        private readonly string           $mailerSender,
    ) {}

    public function __invoke(SendWaitlistNotification $message): void
    {
        $html = sprintf(
            '<p>Ein Gast hat sich für einen ausgebuchten Zeitslot bei <strong>%s</strong> auf die Warteliste gesetzt:</p>'
            . '<ul>'
            . '<li><strong>Gewünschter Zeitpunkt:</strong> %s</li>'
            . '<li><strong>Personen:</strong> %d</li>'
            . '<li><strong>Name:</strong> %s</li>'
            . '<li><strong>E-Mail:</strong> %s</li>'
            . '<li><strong>Telefon:</strong> %s</li>'
            . '</ul>'
            . '<p>Bitte innerhalb von %d Stunden Kontakt aufnehmen, falls ein Platz frei wird.</p>',
            htmlspecialchars($message->venueName),
            htmlspecialchars($message->requestedAt),
            $message->partySize,
            htmlspecialchars($message->guestName),
            htmlspecialchars($message->guestEmail),
            htmlspecialchars($message->guestPhone ?? '—'),
            $message->answerHours,
        );

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->notifyEmail)
            ->subject(sprintf('Neue Warteliste-Anfrage – %s', $message->venueName))
            ->html($html);

        try {
            $this->mailer->send($email);
            $this->logger->info('Warteliste-Benachrichtigung gesendet', [
                'waitlist_entry_id' => $message->waitlistEntryId,
                'to'                => $message->notifyEmail,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Warteliste-Benachrichtigung fehlgeschlagen', [
                'waitlist_entry_id' => $message->waitlistEntryId,
                'to'                => $message->notifyEmail,
                'error'             => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}