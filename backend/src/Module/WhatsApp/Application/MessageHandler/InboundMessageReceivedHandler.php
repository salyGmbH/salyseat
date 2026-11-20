<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\MessageHandler;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\Venue\Domain\Entity\Venue;
use App\Module\WhatsApp\Application\Message\InboundMessageReceived;
use App\Module\WhatsApp\Application\Message\SendWhatsAppMessage;
use App\Module\WhatsApp\Application\Service\ConversationStateMachine;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversation;
use App\Module\WhatsApp\Domain\Entity\WhatsappMessageDirection;
use App\Module\WhatsApp\Domain\Entity\WhatsappMessageLog;
use App\Module\WhatsApp\Domain\Repository\WhatsappConversationRepositoryInterface;
use App\Module\WhatsApp\Domain\Repository\WhatsappMessageLogRepositoryInterface;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Uid\Uuid;

#[AsMessageHandler]
final class InboundMessageReceivedHandler
{
    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
        private readonly EntityManagerInterface $em,
        private readonly WhatsappConversationRepositoryInterface $conversations,
        private readonly WhatsappMessageLogRepositoryInterface $messageLog,
        private readonly ConversationStateMachine $stateMachine,
        private readonly MessageBusInterface $bus,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(InboundMessageReceived $message): void
    {
        // Idempotenz — dieselbe WhatsApp/360dialog-Nachricht kann durch
        // Webhook-Retries mehrfach zugestellt werden.
        if ($message->waMessageId !== null && $this->messageLog->existsByWaMessageId($message->waMessageId)) {
            return;
        }

        $tenant = $this->tenants->findById(Uuid::fromString($message->tenantId));
        if ($tenant === null) {
            return;
        }

        // Defensive Wiederholung des Addon-Gates aus dem Webhook-Controller —
        // die Nachricht kann in der Queue gelegen haben, während ein
        // Superadmin das Addon zwischenzeitlich deaktiviert hat.
        if (!in_array('whatsapp', $tenant->getUiSettings()['addons'] ?? [], true)) {
            return;
        }

        $this->messageLog->save(new WhatsappMessageLog(
            direction:    WhatsappMessageDirection::INBOUND,
            phone:        $message->fromPhone,
            tenantId:     $tenant->getId(),
            waMessageId:  $message->waMessageId,
            body:         $message->textBody,
        ));

        $venues = $this->em->getRepository(Venue::class)->findBy(['tenant' => $tenant, 'active' => true]);

        if (count($venues) !== 1) {
            // v1 unterstützt bewusst nur Tenants mit genau einem aktiven Venue
            // automatisch (siehe Plan, offene Frage "Multi-Venue"). Andernfalls
            // lieber ein klarer Hinweis als eine falsche Zuordnung.
            $this->logger->warning('WhatsApp-Bot: Tenant hat nicht genau ein aktives Venue, überspringe', [
                'tenant_id'    => $message->tenantId,
                'venue_count'  => count($venues),
            ]);
            $this->bus->dispatch(new SendWhatsAppMessage(
                tenantId: $message->tenantId,
                toPhone:  $message->fromPhone,
                body:     'Vielen Dank für deine Nachricht! Für deine Reservierung ruf uns bitte direkt an.',
            ));
            return;
        }

        $venue = $venues[0];

        $conversation = $this->conversations->findOpenByTenantAndPhone($tenant, $message->fromPhone);
        if ($conversation === null) {
            $conversation = new WhatsappConversation($tenant, $message->fromPhone, $message->waProfileName);
            $conversation->setVenue($venue);
        }

        $reply = $this->stateMachine->handle($conversation, $message->textBody, $venue);

        $this->conversations->save($conversation);

        $this->bus->dispatch(new SendWhatsAppMessage(
            tenantId:       $message->tenantId,
            toPhone:        $message->fromPhone,
            body:           $reply,
            conversationId: $conversation->getId()->toRfc4122(),
        ));
    }
}