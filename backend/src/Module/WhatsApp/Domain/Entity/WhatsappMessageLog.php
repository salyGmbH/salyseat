<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Reiner Audit-/Debug-Trail für jede ein- und ausgehende WhatsApp-Nachricht
 * inkl. Rohdaten — erlaubt, echte Webhook-Payloads später zu reproduzieren
 * und dient als Idempotenz-Nachweis (wa_message_id) gegen doppelt zugestellte
 * Webhook-Events.
 */
#[ORM\Entity]
#[ORM\Table(name: 'whatsapp_message_log')]
#[ORM\Index(name: 'idx_whatsapp_message_log_tenant', columns: ['tenant_id'])]
#[ORM\Index(name: 'idx_whatsapp_message_log_wa_message_id', columns: ['wa_message_id'])]
class WhatsappMessageLog
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\Column(type: UuidType::NAME, name: 'tenant_id', nullable: true)]
    private ?Uuid $tenantId = null;

    #[ORM\Column(type: UuidType::NAME, name: 'conversation_id', nullable: true)]
    private ?Uuid $conversationId = null;

    #[ORM\Column(length: 10)]
    private string $direction;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $waMessageId = null;

    #[ORM\Column(length: 20)]
    private string $phone;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $body = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $payload = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(
        string $direction,
        string $phone,
        ?Uuid $tenantId = null,
        ?Uuid $conversationId = null,
        ?string $waMessageId = null,
        ?string $body = null,
        ?array $payload = null,
    ) {
        $this->id             = Uuid::v7();
        $this->direction       = $direction;
        $this->phone            = $phone;
        $this->tenantId        = $tenantId;
        $this->conversationId  = $conversationId;
        $this->waMessageId     = $waMessageId;
        $this->body             = $body;
        $this->payload          = $payload;
        $this->createdAt       = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getWaMessageId(): ?string
    {
        return $this->waMessageId;
    }
}