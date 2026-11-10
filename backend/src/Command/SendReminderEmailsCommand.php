<?php

declare(strict_types=1);

namespace App\Command;

use App\Messenger\Message\SendReminderEmail;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:send-reminder-emails',
    description: 'Sendet Erinnerungs-Mails für bevorstehende Reservierungen.',
)]
final class SendReminderEmailsCommand extends Command
{
    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
        private readonly EntityManagerInterface   $em,
        private readonly MessageBusInterface      $bus,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $now = new \DateTimeImmutable();
        $sent = 0;

        foreach ($this->tenants->findAll() as $tenant) {
            $settings    = $tenant->getUiSettings() ?? [];
            $emailSets   = $settings['emailSettings'] ?? [];

            // Reminder-Mail aktiviert?
            $mailEnabled = true;
            foreach (($emailSets['mailSettings'] ?? []) as $ms) {
                if (($ms['key'] ?? '') === 'reminder') {
                    $mailEnabled = (bool) ($ms['enabled'] ?? true);
                    break;
                }
            }
            if (!$mailEnabled) {
                continue;
            }

            // Vorlaufzeit: '3min' (Test), '2h' oder '24h' (Default: 24h)
            $reminderTime  = $emailSets['reminderTime'] ?? '24h';
            $windowMinutes = match ($reminderTime) {
                '3min' => 3,
                '2h'   => 120,
                default => 1440,
            };

            // Zeitfenster: Reservierungen die in [windowMinutes-5 … windowMinutes+5] Minuten starten
            $windowStart = $now->modify(sprintf('+%d minutes', $windowMinutes - 5));
            $windowEnd   = $now->modify(sprintf('+%d minutes', $windowMinutes + 5));

            $reservations = $this->em->createQuery(
                'SELECT r FROM App\Module\Reservation\Domain\Entity\Reservation r
                 JOIN r.venue v
                 WHERE v.tenant = :tenant
                   AND r.startsAt >= :windowStart
                   AND r.startsAt <= :windowEnd
                   AND r.reminderSentAt IS NULL
                   AND r.status IN (:statuses)
                   AND r.guestEmail != \'\'',
            )
                ->setParameter('tenant', $tenant)
                ->setParameter('windowStart', $windowStart)
                ->setParameter('windowEnd', $windowEnd)
                ->setParameter('statuses', ['pending', 'confirmed'])
                ->getResult();

            foreach ($reservations as $reservation) {
                $this->bus->dispatch(new SendReminderEmail(
                    reservationId: $reservation->getId()->toRfc4122(),
                    guestEmail:    $reservation->getGuestEmail(),
                    guestName:     $reservation->getGuestName(),
                    startsAt:      $reservation->getStartsAt()->format('d.m.Y H:i'),
                    venueName:     $reservation->getVenue()->getName(),
                    partySize:     $reservation->getPartySize(),
                    tenantId:      $tenant->getId()->toRfc4122(),
                ));

                $reservation->markReminderSent();
                $this->em->persist($reservation);
                $sent++;

                $io->writeln(sprintf(
                    '  → Erinnerung für %s (%s) an %s',
                    $reservation->getGuestName(),
                    $reservation->getStartsAt()->format('d.m.Y H:i'),
                    $reservation->getGuestEmail(),
                ));
            }
        }

        $this->em->flush();
        $io->success(sprintf('%d Erinnerungs-Mail(s) in die Queue gestellt.', $sent));

        return Command::SUCCESS;
    }
}