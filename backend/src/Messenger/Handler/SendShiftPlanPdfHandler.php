<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\SendShiftPlanPdf;
use App\Messenger\Service\TenantEmailSettingsProvider;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;
use Twig\Environment;

#[AsMessageHandler]
final class SendShiftPlanPdfHandler
{
    public function __construct(
        private readonly MailerInterface              $mailer,
        private readonly Environment                  $twig,
        private readonly TenantEmailSettingsProvider  $settings,
        private readonly LoggerInterface              $logger,
        private readonly string                       $mailerSender,
    ) {}

    public function __invoke(SendShiftPlanPdf $message): void
    {
        $s = $this->settings->getForTenant($message->tenantId);

        $html = $this->twig->render('email/shift_plan_pdf.html.twig', [
            'guest_name' => $message->recipientName,
            'venue_name' => $message->venueName,
            'week_label' => $message->weekLabel,
            'design'     => $s['design'],
            'social'     => $s['social'],
            'logoLight'  => $s['logoLight'],
            'logoDark'   => $s['logoDark'],
        ]);

        $email = (new Email())
            ->from($this->mailerSender)
            ->to($message->recipientEmail)
            ->subject(sprintf('Dein Schichtplan – %s', $message->weekLabel))
            ->html($html)
            ->attach(base64_decode($message->pdfBase64), $message->fileName, 'application/pdf');

        try {
            $this->mailer->send($email);
            $this->logger->info('Schichtplan-PDF-Mail gesendet', [
                'to'     => $message->recipientEmail,
                'tenant' => $message->tenantId,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Schichtplan-PDF-Mail fehlgeschlagen', [
                'to'    => $message->recipientEmail,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
