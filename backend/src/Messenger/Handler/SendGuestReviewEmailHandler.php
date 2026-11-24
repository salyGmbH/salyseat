<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendGuestReviewEmail;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendGuestReviewEmailHandler
{
    public function __construct(
        private readonly MailerInterface              $mailer,
        private readonly Environment                 $twig,
        private readonly TenantEmailSettingsProvider $settings,
        private readonly LoggerInterface             $logger,
        private readonly string                      $mailerSender,
        #[Autowire(param: 'widget_base_url')]
        private readonly string                      $widgetBaseUrl,
    ) {}

    public function __invoke(SendGuestReviewEmail $message): void
    {
        $s = $message->tenantId !== '' ? $this->settings->getForTenant($message->tenantId) : $this->settings->defaults();

        $reviewUrl = rtrim($this->widgetBaseUrl, '/') . '/bewertung?token=' . $message->token;

        $html = $this->twig->render('email/guest_review_request.html.twig', [
            'guest_name'   => $message->guestName,
            'venue_name'   => $message->venueName,
            'action_url'   => $reviewUrl,
            'mail_content' => $s['content']['guest_review'],
            'design'       => $s['design'],
            'social'       => $s['social'],
            'header_image'  => $s['headerImage'],
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->guestEmail)
            ->subject(sprintf('Wie war Ihr Besuch bei %s?', $message->venueName))
            ->html($html);

        try {
            $this->mailer->send($email);
            $this->logger->info('Bewertungs-Anfrage gesendet', [
                'reservation_id' => $message->reservationId,
                'to'             => $message->guestEmail,
                'venue'          => $message->venueName,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Bewertungs-Anfrage fehlgeschlagen', [
                'reservation_id' => $message->reservationId,
                'to'             => $message->guestEmail,
                'error'          => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
