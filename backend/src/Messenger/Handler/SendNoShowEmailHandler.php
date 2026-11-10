<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendNoShowEmail;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendNoShowEmailHandler
{
    public function __construct(
        private readonly MailerInterface              $mailer,
        private readonly Environment                 $twig,
        private readonly TenantEmailSettingsProvider $settings,
        private readonly string                      $mailerSender,
    ) {}

    public function __invoke(SendNoShowEmail $message): void
    {
        $s = $message->tenantId !== '' ? $this->settings->getForTenant($message->tenantId) : $this->settings->defaults();

        $html = $this->twig->render('email/reservation_no_show.html.twig', [
            'guest_name'   => $message->guestName,
            'venue_name'   => $message->venueName,
            'starts_at'    => $message->startsAt,
            'mail_content' => $s['content']['no_show'],
            'design'       => $s['design'],
            'social'       => $s['social'],
            'logoLight'    => $s['logoLight'],
            'logoDark'     => $s['logoDark'],
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->guestEmail)
            ->subject(sprintf('Ihre verpasste Reservierung bei %s', $message->venueName))
            ->html($html);

        $this->mailer->send($email);
    }
}
