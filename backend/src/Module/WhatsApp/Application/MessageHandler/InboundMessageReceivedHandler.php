<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\MessageHandler;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use App\Module\Venue\Domain\Entity\Venue;
use App\Module\WhatsApp\Application\Message\InboundMessageReceived;
use App\Module\WhatsApp\Application\Message\SendWhatsAppMessage;
use App\Module\WhatsApp\Application\Service\ConversationStateMachine;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversation;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversationState;
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

        $venues = $this->resolveActiveVenues($tenant);

        if (count($venues) === 0) {
            $this->logger->warning('WhatsApp-Bot: Tenant hat kein aktives Venue, überspringe', [
                'tenant_id' => $message->tenantId,
            ]);
            $this->bus->dispatch(new SendWhatsAppMessage(
                tenantId: $message->tenantId,
                toPhone:  $message->fromPhone,
                body:     'Vielen Dank für deine Nachricht! Für deine Reservierung ruf uns bitte direkt an.',
            ));
            return;
        }

        $conversation = $this->conversations->findOpenByTenantAndPhone($tenant, $message->fromPhone);
        if ($conversation === null) {
            $conversation = new WhatsappConversation($tenant, $message->fromPhone, $message->waProfileName);
            if (count($venues) === 1) {
                // Eindeutig — Raumauswahl-Schritt entfällt, direkt zur Personenzahl.
                $conversation->setVenue($venues[0]);
            } else {
                // Mehrere aktive Räume — Bot fragt zuerst, welcher gemeint ist.
                $conversation->setState(WhatsappConversationState::AWAITING_VENUE);
            }
        }

        $reply = $this->stateMachine->handle($conversation, $message->textBody, $venues);

        $this->conversations->save($conversation);

        $this->bus->dispatch(new SendWhatsAppMessage(
            tenantId:       $message->tenantId,
            toPhone:        $message->fromPhone,
            body:           $reply,
            conversationId: $conversation->getId()->toRfc4122(),
        ));
    }

    /**
     * Die "aktiven Räume" für den WhatsApp-Bot sind dieselben, die der Tenant
     * unter Einstellungen → Widget-Einstellungen → Raumauswahl für die Online-
     * Buchung freigegeben hat (tenant.uiSettings.widgetFunctional.raumauswahlAktiveIds)
     * — NICHT das separate venues.active-Flag (das steuert nur, ob ein Venue
     * grundsätzlich existiert/betrieben wird, nicht ob es online buchbar ist).
     * Ist die Liste leer (Tenant hat die Widget-Einstellungen nie geöffnet),
     * gilt derselbe Default wie im Widget-Frontend: alle aktiven Venues zählen.
     *
     * @return Venue[] stabil sortiert nach Name, damit die im awaiting_venue-
     *                  Schritt gezeigte nummerierte Liste bei jeder Nachricht
     *                  dieselbe Zuordnung ergibt.
     */
    private function resolveActiveVenues(Tenant $tenant): array
    {
        $activeIds = $tenant->getUiSettings()['widgetFunctional']['raumauswahlAktiveIds'] ?? [];

        if (empty($activeIds)) {
            return $this->em->getRepository(Venue::class)->findBy(
                ['tenant' => $tenant, 'active' => true],
                ['name' => 'ASC'],
            );
        }

        $uuids = array_values(array_filter(array_map(
            static function (string $id): ?Uuid {
                try {
                    return Uuid::fromString($id);
                } catch (\InvalidArgumentException) {
                    return null;
                }
            },
            $activeIds,
        )));

        if (empty($uuids)) {
            return [];
        }

        return $this->em->getRepository(Venue::class)->findBy(
            ['id' => $uuids, 'tenant' => $tenant, 'active' => true],
            ['name' => 'ASC'],
        );
    }
}
