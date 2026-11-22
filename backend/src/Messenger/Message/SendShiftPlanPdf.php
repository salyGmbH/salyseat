<?php

declare(strict_types=1);

namespace App\Messenger\Message;

final readonly class SendShiftPlanPdf
{
    public function __construct(
        public string $tenantId,
        public string $recipientEmail,
        public string $recipientName,
        public string $venueName,
        public string $weekLabel,
        public string $pdfBase64,
        public string $fileName,
    ) {}
}