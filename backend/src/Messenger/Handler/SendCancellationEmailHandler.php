<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendCancellationEmail;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendCancellationEmailHandler
{
    public function __construct(
        private readonly MailerInterface $mailer,
        private readonly Environment $twig,
        private readonly string $mailerSender,
    ) {}

    public function __invoke(SendCancellationEmail $message): void
    {
        $html = $this->twig->render('email/reservation_cancelled.html.twig', [
            'guest_name' => $message->guestName,
            'starts_at'  => $message->startsAt,
            'venue_name' => $message->venueName,
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->guestEmail)
            ->subject(sprintf('Ihre Reservierung bei %s wurde storniert', $message->venueName))
            ->html($html);

        $this->mailer->send($email);
    }
}
