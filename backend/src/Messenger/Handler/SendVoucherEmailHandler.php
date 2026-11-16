<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendVoucherEmail;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendVoucherEmailHandler
{
    public function __construct(
        private readonly MailerInterface              $mailer,
        private readonly Environment                 $twig,
        private readonly TenantEmailSettingsProvider $settings,
        private readonly LoggerInterface             $logger,
        private readonly string                      $mailerSender,
    ) {}

    public function __invoke(SendVoucherEmail $message): void
    {
        $s = $this->settings->getForTenant($message->tenantId);

        $html = $this->twig->render('email/voucher_purchased.html.twig', [
            'guest_name'     => $message->recipientName,
            'buyer_name'     => $message->buyerName,
            'venue_name'     => $message->venueName,
            'code'           => $message->code,
            'amount'         => number_format($message->amount, 2, ',', '.'),
            'expires_at'     => $message->expiresAt,
            'personal_message' => $message->message,
            'design'         => $s['design'],
            'social'         => $s['social'],
            'logoLight'      => $s['logoLight'],
            'logoDark'       => $s['logoDark'],
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->recipientEmail)
            ->subject(sprintf('Ihr Gutschein bei %s', $message->venueName))
            ->html($html);

        try {
            $this->mailer->send($email);
            $this->logger->info('Gutschein-Mail gesendet', [
                'voucher_id' => $message->voucherId,
                'to'         => $message->recipientEmail,
                'venue'      => $message->venueName,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Gutschein-Mail fehlgeschlagen', [
                'voucher_id' => $message->voucherId,
                'to'         => $message->recipientEmail,
                'error'      => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}