<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendReminderEmail;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendReminderEmailHandler
{
    public function __construct(
        private readonly MailerInterface              $mailer,
        private readonly Environment                 $twig,
        private readonly TenantEmailSettingsProvider $settings,
        private readonly string                      $mailerSender,
    ) {}

    public function __invoke(SendReminderEmail $message): void
    {
        $s = $message->tenantId !== '' ? $this->settings->getForTenant($message->tenantId) : $this->settings->defaults();

        $html = $this->twig->render('email/reservation_reminder.html.twig', [
            'guest_name'   => $message->guestName,
            'venue_name'   => $message->venueName,
            'starts_at'    => $message->startsAt,
            'party_size'   => $message->partySize ?? '—',
            'mail_content' => $s['content']['reminder'],
            'design'       => $s['design'],
            'social'       => $s['social'],
            'logoLight'    => $s['logoLight'],
            'logoDark'     => $s['logoDark'],
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->guestEmail)
            ->subject(sprintf('Erinnerung an Ihre Reservierung bei %s', $message->venueName))
            ->html($html);

        $this->mailer->send($email);
    }
}
