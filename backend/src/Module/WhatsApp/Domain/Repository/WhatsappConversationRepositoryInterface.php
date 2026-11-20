<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Repository;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversation;
use Symfony\Component\Uid\Uuid;

interface WhatsappConversationRepositoryInterface
{
    public function findById(Uuid $id): ?WhatsappConversation;

    /**
     * Die zuletzt aktualisierte, noch offene (nicht-terminale) Konversation
     * für diesen Gast bei diesem Tenant — oder null, wenn keine existiert
     * (dann startet der Aufrufer einen neuen Dialog).
     */
    public function findOpenByTenantAndPhone(Tenant $tenant, string $phone): ?WhatsappConversation;

    public function save(WhatsappConversation $conversation): void;
}