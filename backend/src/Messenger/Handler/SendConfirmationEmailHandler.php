<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendConfirmationEmail;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendConfirmationEmailHandler
{
    public function __construct(
        private readonly MailerInterface $mailer,
        private readonly Environment $twig,
        private readonly string $mailerSender,
        private readonly string $widgetBaseUrl,
    ) {}

    public function __invoke(SendConfirmationEmail $message): void
    {
        $html = $this->twig->render('email/reservation_confirmed.html.twig', [
            'guest_name'  => $message->guestName,
            'starts_at'   => $message->startsAt,
            'party_size'  => $message->partySize,
            'venue_name'  => $message->venueName,
            'cancel_url'  => sprintf('%s/cancel/%s', rtrim($this->widgetBaseUrl, '/'), $message->reservationToken),
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->guestEmail)
            ->subject(sprintf('Ihre Reservierung bei %s ist bestätigt', $message->venueName))
            ->html($html);

        $this->mailer->send($email);
    }
}
