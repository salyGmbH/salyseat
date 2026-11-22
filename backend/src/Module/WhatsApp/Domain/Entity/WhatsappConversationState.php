<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Entity;

final class WhatsappConversationState
{
    /** Nur durchlaufen, wenn der Tenant mehr als ein aktives Venue hat — siehe ConversationStateMachine. */
    public const AWAITING_VENUE        = 'awaiting_venue';
    public const AWAITING_PARTY_SIZE   = 'awaiting_party_size';
    public const AWAITING_DATE         = 'awaiting_date';
    public const AWAITING_TIME         = 'awaiting_time';
    public const AWAITING_NAME         = 'awaiting_name';
    public const AWAITING_CONFIRMATION = 'awaiting_confirmation';
    public const COMPLETED             = 'completed';
    public const ABANDONED             = 'abandoned';
    public const CANCELLED             = 'cancelled';

    public const ALL = [
        self::AWAITING_VENUE,
        self::AWAITING_PARTY_SIZE,
        self::AWAITING_DATE,
        self::AWAITING_TIME,
        self::AWAITING_NAME,
        self::AWAITING_CONFIRMATION,
        self::COMPLETED,
        self::ABANDONED,
        self::CANCELLED,
    ];

    /** Endzustände — eine Konversation in einem dieser States gilt nicht mehr als "offen". */
    public const TERMINAL = [
        self::COMPLETED,
        self::ABANDONED,
        self::CANCELLED,
    ];
}
