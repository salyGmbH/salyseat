<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendConfirmationEmail;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendConfirmationEmailHandler
{
    public function __construct(
        private readonly MailerInterface              $mailer,
        private readonly Environment                 $twig,
        private readonly TenantEmailSettingsProvider $settings,
        private readonly string                      $mailerSender,
        private readonly string                      $publicDir,
        private readonly string                      $widgetBaseUrl,
    ) {}

    public function __invoke(SendConfirmationEmail $message): void
    {
        $s = $message->tenantId !== '' ? $this->settings->getForTenant($message->tenantId) : $this->settings->defaults();

        $html = $this->twig->render('email/reservation_confirmed.html.twig', [
            'guest_name'  => $message->guestName,
            'venue_name'  => $message->venueName,
            'starts_at'   => $message->startsAt,
            'party_size'  => $message->partySize,
            'cancel_url'  => sprintf('%s/cancel/%s', rtrim($this->widgetBaseUrl, '/'), $message->reservationToken),
            'mail_content' => $s['content']['confirmation'],
            'design'       => $s['design'],
            'social'       => $s['social'],
            'logoLight'    => $s['logoLight'],
            'logoDark'     => $s['logoDark'],
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->guestEmail)
            ->subject(sprintf('Ihre Reservierung bei %s ist bestätigt', $message->venueName))
            ->html($html);

        foreach ($s['attachments'] as $att) {
            if (empty($att['assignedMails']['confirmation'])) continue;
            $path = $this->publicDir . $att['url'];
            if (is_file($path)) {
                $email->attachFromPath($path, $att['name'] ?? basename($path));
            }
        }

        $this->mailer->send($email);
    }
}
