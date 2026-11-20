<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Entity;

final class WhatsappMessageDirection
{
    public const INBOUND  = 'inbound';
    public const OUTBOUND = 'outbound';
}