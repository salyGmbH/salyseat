<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendConfirmationEmail;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Psr\Log\LoggerInterface;
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
        private readonly LoggerInterface             $logger,
        private readonly string                      $mailerSender,
        private readonly string                      $publicDir,
    ) {}

    public function __invoke(SendConfirmationEmail $message): void
    {
        $s      = $message->tenantId !== '' ? $this->settings->getForTenant($message->tenantId) : $this->settings->defaults();
        $policy = $s['policy'];

        $html = $this->twig->render('email/reservation_confirmed.html.twig', [
            'guest_name'  => $message->guestName,
            'venue_name'  => $message->venueName,
            'starts_at'   => $message->startsAt,
            'party_size'  => $message->partySize,
            'cancel_url'  => sprintf('https://widget.salyseat.io/cancel/%s', $message->reservationToken),
            'change_deadline_text' => $policy['onlineAenderungen']
                ? 'Änderungen möglich bis ' . $this->formatMinutenPolicy($policy['onlineAenderungenMinuten']) . ' vor der Reservierung.'
                : null,
            'cancel_deadline_text' => $policy['onlineStornierung']
                ? 'Stornierung möglich bis ' . $this->formatMinutenPolicy($policy['onlineStornierungMinuten']) . ' vor der Reservierung.'
                : null,
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

        try {
            $this->mailer->send($email);
            $this->logger->info('Bestätigungsmail gesendet', [
                'reservation_id' => $message->reservationId,
                'to'             => $message->guestEmail,
                'venue'          => $message->venueName,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Bestätigungsmail fehlgeschlagen', [
                'reservation_id' => $message->reservationId,
                'to'             => $message->guestEmail,
                'error'          => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /** Formatiert Minuten wie im Widget: "45 Min." / "2 Std." / "2 Std. 30 Min." */
    private function formatMinutenPolicy(int $minutes): string
    {
        if ($minutes < 60) {
            return $minutes . ' Min.';
        }
        $h = intdiv($minutes, 60);
        $m = $minutes % 60;
        return $m === 0 ? $h . ' Std.' : $h . ' Std. ' . $m . ' Min.';
    }
}
