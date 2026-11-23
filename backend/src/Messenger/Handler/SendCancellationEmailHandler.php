<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendCancellationEmail;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendCancellationEmailHandler
{
    public function __construct(
        private readonly MailerInterface              $mailer,
        private readonly Environment                 $twig,
        private readonly TenantEmailSettingsProvider $settings,
        private readonly LoggerInterface             $logger,
        private readonly string                      $mailerSender,
        private readonly string                      $publicDir,
    ) {}

    public function __invoke(SendCancellationEmail $message): void
    {
        $s = $message->tenantId !== '' ? $this->settings->getForTenant($message->tenantId) : $this->settings->defaults();

        $html = $this->twig->render('email/reservation_cancelled.html.twig', [
            'guest_name'       => $message->guestName,
            'guest_first_name' => $message->guestFirstName,
            'occasion'         => $message->occasion,
            'venue_name'   => $message->venueName,
            'starts_at'    => $message->startsAt,
            'mail_content' => $s['content']['cancel'],
            'design'       => $s['design'],
            'social'       => $s['social'],
            'logoLight'    => $s['logoLight'],
            'logoDark'     => $s['logoDark'],
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->guestEmail)
            ->subject(sprintf('Ihre Reservierung bei %s wurde storniert', $message->venueName))
            ->html($html);

        foreach ($s['attachments'] as $att) {
            if (empty($att['assignedMails']['cancel'])) continue;
            $path = $this->publicDir . $att['url'];
            if (is_file($path)) {
                $email->attachFromPath($path, $att['name'] ?? basename($path));
            }
        }

        try {
            $this->mailer->send($email);
            $this->logger->info('Stornierungsmail gesendet', [
                'reservation_id' => $message->reservationId,
                'to'             => $message->guestEmail,
                'venue'          => $message->venueName,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Stornierungsmail fehlgeschlagen', [
                'reservation_id' => $message->reservationId,
                'to'             => $message->guestEmail,
                'error'          => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
