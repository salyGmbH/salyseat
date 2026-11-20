<?php

declare(strict_types=1);

namespace App\Command;

use App\Module\Reservation\Domain\Entity\ReservationStatus;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * "Automatisches Auschecken" (Einstellungen → Reservierungen): Tenants, die das
 * aktiviert haben, bekommen am Ende des Tages alle noch offenen Reservierungen
 * (pending/confirmed/seated/cleanup) automatisch auf "completed" gesetzt.
 *
 * Wird per Docker-Compose-Loop einmal täglich um 23:57 Uhr aufgerufen
 * (siehe docker-compose.yml, Service auto_checkout_scheduler).
 */
#[AsCommand(
    name: 'app:auto-checkout',
    description: 'Checkt am Ende des Tages alle noch offenen Reservierungen automatisch aus (nur Tenants mit aktiviertem Auto-Checkout).',
)]
final class AutoCheckoutCommand extends Command
{
    private const OPEN_STATUSES = [
        ReservationStatus::PENDING,
        ReservationStatus::CONFIRMED,
        ReservationStatus::SEATED,
        ReservationStatus::CLEANUP,
    ];

    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
        private readonly EntityManagerInterface   $em,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io       = new SymfonyStyle($input, $output);
        $dayStart = (new \DateTimeImmutable('today'));
        $dayEnd   = $dayStart->modify('+1 day');
        $checkedOut = 0;

        foreach ($this->tenants->findAll() as $tenant) {
            $settings = $tenant->getUiSettings() ?? [];
            if (empty($settings['autoCheckoutEnabled'])) {
                continue;
            }

            $reservations = $this->em->createQuery(
                'SELECT r FROM App\Module\Reservation\Domain\Entity\Reservation r
                 JOIN r.venue v
                 WHERE v.tenant = :tenant
                   AND r.startsAt >= :dayStart
                   AND r.startsAt <  :dayEnd
                   AND r.status IN (:statuses)',
            )
                ->setParameter('tenant', $tenant)
                ->setParameter('dayStart', $dayStart)
                ->setParameter('dayEnd', $dayEnd)
                ->setParameter('statuses', self::OPEN_STATUSES)
                ->getResult();

            foreach ($reservations as $reservation) {
                $reservation->complete();
                $this->em->persist($reservation);
                $checkedOut++;

                $io->writeln(sprintf(
                    '  → %s (%s, Tisch %s) automatisch ausgecheckt',
                    $reservation->getGuestName(),
                    $reservation->getStartsAt()->format('d.m.Y H:i'),
                    $reservation->getTableNumber() ?? '–',
                ));
            }
        }

        $this->em->flush();
        $io->success(sprintf('%d Reservierung(en) automatisch ausgecheckt.', $checkedOut));

        return Command::SUCCESS;
    }
}