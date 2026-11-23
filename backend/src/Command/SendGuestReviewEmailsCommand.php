<?php

declare(strict_types=1);

namespace App\Command;

use App\Messenger\Message\SendGuestReviewEmail;
use App\Module\Reservation\Domain\Entity\ReservationStatus;
use App\Module\Review\Domain\Entity\GuestReview;
use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:send-guest-review-emails',
    description: 'Sendet Bewertungs-Anfragen für abgeschlossene Reservierungen.',
)]
final class SendGuestReviewEmailsCommand extends Command
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
        $io  = new SymfonyStyle($input, $output);
        $now = new \DateTimeImmutable();
        $sent = 0;

        foreach ($this->tenants->findAll() as $tenant) {
            $settings = $tenant->getUiSettings() ?? [];
            // Eigener Top-Level-Key (nicht unter emailSettings) — die Einstellungen-Seite
            // "E-Mails" überschreibt emailSettings beim Speichern komplett (kein Deep-Merge),
            // ein verschachtelter Key dort würde also bei jedem Speichern dort verloren gehen.
            $reviewSets = $settings['guestReviewSettings'] ?? [];

            // Bewertungs-Mail aktiviert? (Default: aus, muss bewusst angeschaltet werden)
            if (!($reviewSets['enabled'] ?? false)) {
                continue;
            }

            // Verzögerung nach Reservierungsende: '1h', '4h', '24h' oder '3d' (Default: 24h)
            $reviewDelay  = $reviewSets['delay'] ?? '24h';
            $delayMinutes = match ($reviewDelay) {
                '2min' => 2,
                '1h'   => 60,
                '4h'   => 240,
                '3d'   => 4320,
                default => 1440,
            };

            $threshold = $now->modify(sprintf('-%d minutes', $delayMinutes));
            // Sicherheitsgrenze: keine Bewertungs-Mails für sehr alte Reservierungen (z.B. beim
            // erstmaligen Aktivieren des Features), damit niemand eine Flut alter Anfragen bekommt.
            $oldestAllowed = $now->modify('-14 days');

            $reservations = $this->em->createQuery(
                'SELECT r FROM App\Module\Reservation\Domain\Entity\Reservation r
                 JOIN r.venue v
                 WHERE IDENTITY(v.tenant) = :tenantId
                   AND r.endsAt <= :threshold
                   AND r.endsAt >= :oldestAllowed
                   AND r.reviewRequestSentAt IS NULL
                   AND r.status IN (:statuses)
                   AND r.guestEmail != \'\'',
            )
                // Hinweis: v.tenant = :tenant (Entity als Parameter) findet hier bei diesem
                // custom UuidType lautlos 0 Zeilen — IDENTITY() + roher Uuid-Wert umgeht das.
                ->setParameter('tenantId', $tenant->getId(), UuidType::NAME)
                ->setParameter('threshold', $threshold)
                ->setParameter('oldestAllowed', $oldestAllowed)
                ->setParameter('statuses', [
                    ReservationStatus::CONFIRMED,
                    ReservationStatus::SEATED,
                    ReservationStatus::CLEANUP,
                    ReservationStatus::COMPLETED,
                ])
                ->getResult();

            foreach ($reservations as $reservation) {
                $token = bin2hex(random_bytes(32));

                $review = new GuestReview(
                    tenant:        $tenant,
                    reservationId: $reservation->getId()->toRfc4122(),
                    guestName:     $reservation->getGuestName(),
                    token:         $token,
                );
                $this->em->persist($review);

                $this->bus->dispatch(new SendGuestReviewEmail(
                    reservationId: $reservation->getId()->toRfc4122(),
                    guestEmail:    $reservation->getGuestEmail(),
                    guestName:     $reservation->getGuestName(),
                    venueName:     $reservation->getVenue()->getName(),
                    token:         $token,
                    tenantId:      $tenant->getId()->toRfc4122(),
                ));

                $reservation->markReviewRequestSent();
                $this->em->persist($reservation);
                $sent++;

                $io->writeln(sprintf(
                    '  → Bewertungs-Anfrage für %s (Reservierung vom %s) an %s',
                    $reservation->getGuestName(),
                    $reservation->getEndsAt()->format('d.m.Y H:i'),
                    $reservation->getGuestEmail(),
                ));
            }
        }

        $this->em->flush();
        $io->success(sprintf('%d Bewertungs-Anfrage(n) in die Queue gestellt.', $sent));

        return Command::SUCCESS;
    }
}