<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Repository;

use App\Module\WhatsApp\Domain\Entity\WhatsappMessageLog;

interface WhatsappMessageLogRepositoryInterface
{
    /** Idempotenz-Check gegen erneut zugestellte Webhook-Events. */
    public function existsByWaMessageId(string $waMessageId): bool;

    public function save(WhatsappMessageLog $log): void;
}