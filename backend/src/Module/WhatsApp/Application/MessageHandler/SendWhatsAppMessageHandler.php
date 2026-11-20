<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\MessageHandler;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\WhatsApp\Application\Message\SendWhatsAppMessage;
use App\Module\WhatsApp\Application\WhatsAppConnectorFactory;
use App\Module\WhatsApp\Domain\Entity\WhatsappMessageDirection;
use App\Module\WhatsApp\Domain\Entity\WhatsappMessageLog;
use App\Module\WhatsApp\Domain\Repository\WhatsappMessageLogRepositoryInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

#[AsMessageHandler]
final class SendWhatsAppMessageHandler
{
    public function __construct(
        private readonly WhatsAppConnectorFactory $factory,
        private readonly DoctrineTenantRepository $tenants,
        private readonly WhatsappMessageLogRepositoryInterface $messageLog,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(SendWhatsAppMessage $message): void
    {
        $tenant = $this->tenants->findById(Uuid::fromString($message->tenantId));
        if ($tenant === null) {
            return;
        }

        $gateway = $this->factory->forTenant($tenant);
        if ($gateway === null || !$gateway->isEnabled()) {
            $this->logger->warning('WhatsApp-Versand übersprungen: kein aktiver Gateway für Tenant', [
                'tenant_id' => $message->tenantId,
            ]);
            return;
        }

        try {
            $waMessageId = $gateway->sendTextMessage($message->toPhone, $message->body);
        } catch (\Throwable $e) {
            $this->logger->error('WhatsApp-Versand fehlgeschlagen', [
                'tenant_id' => $message->tenantId,
                'to'        => $message->toPhone,
                'error'     => $e->getMessage(),
            ]);
            return;
        }

        $this->messageLog->save(new WhatsappMessageLog(
            direction:      WhatsappMessageDirection::OUTBOUND,
            phone:          $message->toPhone,
            tenantId:       $tenant->getId(),
            conversationId: $message->conversationId !== null ? Uuid::fromString($message->conversationId) : null,
            waMessageId:    $waMessageId,
            body:           $message->body,
        ));
    }
}