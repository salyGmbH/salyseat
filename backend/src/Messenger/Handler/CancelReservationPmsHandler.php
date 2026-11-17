<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\CancelReservationInPms;
use App\Module\Pms\Application\PmsConnectorFactory;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

#[AsMessageHandler]
final class CancelReservationInPmsHandler
{
    public function __construct(
        private readonly PmsConnectorFactory $factory,
        private readonly DoctrineTenantRepository $tenants,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(CancelReservationInPms $message): void
    {
        $tenant = $this->tenants->findById(Uuid::fromString($message->tenantId));
        if ($tenant === null) {
            return;
        }

        $pms = $this->factory->forTenant($tenant);
        if ($pms === null || !$pms->isEnabled()) {
            return;
        }

        try {
            $pms->cancelReservation($message->mewsReservationId);
            $this->logger->info('Reservierung in Mews storniert', [
                'mews_reservation_id' => $message->mewsReservationId,
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Mews-Storno fehlgeschlagen', [
                'mews_reservation_id' => $message->mewsReservationId,
                'error'               => $e->getMessage(),
            ]);
        }
    }
}