<?php

declare(strict_types=1);

namespace App\Messenger\Handler;

use App\Messenger\Message\PushReservationToPms;
use App\Module\Pms\Application\PmsConnectorFactory;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

#[AsMessageHandler]
final class PushReservationToPmsHandler
{
    public function __construct(
        private readonly PmsConnectorFactory $factory,
        private readonly ReservationRepositoryInterface $reservations,
        private readonly DoctrineTenantRepository $tenants,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(PushReservationToPms $message): void
    {
        $tenant = $this->tenants->findById(Uuid::fromString($message->tenantId));
        if ($tenant === null) {
            return;
        }

        $pms = $this->factory->forTenant($tenant);
        if ($pms === null || !$pms->isEnabled()) {
            return;
        }

        $reservation = $this->reservations->findById(Uuid::fromString($message->reservationId));
        if ($reservation === null) {
            $this->logger->warning('PMS-Sync: Reservierung nicht gefunden', ['id' => $message->reservationId]);
            return;
        }

        if ($reservation->getMewsReservationId() !== null) {
            return;
        }

        try {
            $mewsId = $pms->pushReservation($reservation);
            $reservation->setPmsSyncStatus('synced', $mewsId);
            $this->logger->info('Reservierung an Mews übertragen', [
                'reservation_id'      => $message->reservationId,
                'mews_reservation_id' => $mewsId,
            ]);
        } catch (\Throwable $e) {
            $reservation->setPmsSyncStatus('failed');
            $this->logger->error('Mews-Sync fehlgeschlagen', [
                'reservation_id' => $message->reservationId,
                'error'          => $e->getMessage(),
            ]);
        }

        $this->em->flush();
    }
}