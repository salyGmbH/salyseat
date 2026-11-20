<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\CreateReservation;

use App\Messenger\Message\PushReservationToPms;
use App\Messenger\Message\SendConfirmationEmail;
use App\Module\Availability\Infrastructure\Persistence\DoctrineTableBlockRepository;
use App\Module\Reservation\Domain\Entity\Guest;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\GuestRepositoryInterface;
use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\MessageBusInterface;

final class CreateReservationHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GuestRepositoryInterface $guests,
        private readonly MessageBusInterface $bus,
        private readonly Connection $dbal,
        private readonly DoctrineTableBlockRepository $tableBlockRepo,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(CreateReservationCommand $cmd): Reservation
    {
        $venue = $this->em->getRepository(Venue::class)->find($cmd->venueId)
            ?? throw new \DomainException('Venue nicht gefunden.');

        if (!$venue->isActive()) {
            throw new \DomainException('Dieses Venue nimmt aktuell keine Buchungen an.');
        }

        // Raumsperrung prüfen
        $dateStr   = $cmd->startsAt->format('Y-m-d');
        $timeStr   = $cmd->startsAt->format('H:i');
        $venueBlock = $this->dbal->fetchOne(
            'SELECT id FROM venue_blocks
              WHERE venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND date_from <= ? AND date_to >= ?
                AND (full_day = 1 OR (time_from <= ? AND time_to > ?))
              LIMIT 1',
            [$venue->getId()->toRfc4122(), $dateStr, $dateStr, $timeStr, $timeStr],
        );
        if ($venueBlock !== false) {
            throw new \DomainException('Dieser Raum ist für das gewählte Datum gesperrt.');
        }

        $tenant = $venue->getTenant();

        $guest = $this->guests->findByTenantAndEmail($tenant->getId(), $cmd->guestEmail);

        if ($guest === null) {
            $guest = new Guest($tenant, $cmd->guestName, $cmd->guestEmail);
            if ($cmd->guestPhone !== null) {
                $guest->setPhone($cmd->guestPhone);
            }
        }

        if ($this->isEffectivelyBlocked($guest, $tenant) && !$cmd->adminOverride) {
            $this->logger->warning('Reservierungsversuch von gesperrtem Gast abgelehnt', [
                'email'    => $cmd->guestEmail,
                'venue_id' => $cmd->venueId,
            ]);
            throw new \DomainException('Diese E-Mail-Adresse kann aktuell keine Reservierungen vornehmen.');
        }

        $endsAt = $cmd->startsAt->modify(sprintf('+%d minutes', $cmd->durationMinutes ?? $venue->getDefaultDurationMinutes()));

        $reservation = new Reservation(
            $venue,
            $cmd->guestName,
            $cmd->guestEmail,
            $cmd->partySize,
            $cmd->startsAt,
            $endsAt,
            $cmd->guestPhone,
            $cmd->guestNotes,
        );
        // ─── Automatische Tischzuweisung ──────────────────────────────────────
        // Nur im Widget-Flow (adminOverride=false): passendsten freien Tisch suchen.
        // Admin-Reservierungen ohne expliziten Tisch bleiben bewusst auf Warteliste —
        // der Admin weist den Tisch manuell zu.
        if ($cmd->tableNumber === null) {
            if (!$cmd->adminOverride) {
                $uiSettings              = $tenant->getUiSettings() ?? [];
                $ausstehendBestaetigung  = (bool) ($uiSettings['widgetFunctional']['ausstehendBestaetigung'] ?? false);

                $tableNumber = $this->findBestTable(
                    venueId:        $venue->getId()->toRfc4122(),
                    partySize:      $cmd->partySize,
                    startsAt:       $cmd->startsAt,
                    endsAt:         $endsAt,
                    tables:         $venue->getLayout()['tables'] ?? [],
                    venue:          $venue,
                    cleanupMinutes: $this->cleanupMinutes($uiSettings),
                );

                if ($tableNumber !== null) {
                    $reservation->setTableNumber($tableNumber);
                    // Nur bestätigen wenn kein "ausstehende Bestätigung"-Modus aktiv ist.
                    if (!$ausstehendBestaetigung) {
                        $reservation->confirm();
                    }
                }
            }
            // Kein Tisch / Admin ohne Tischauswahl → Reservierung bleibt pending (Warteliste)
        } else {
            // Prüfen ob der explizit gewählte Tisch gesperrt ist
            if ($this->isTableBlocked($venue, $cmd->tableNumber, $cmd->startsAt)) {
                $this->logger->warning('Reservierungsversuch auf gesperrtem Tisch abgelehnt', [
                    'venue_id'     => $cmd->venueId,
                    'table_number' => $cmd->tableNumber,
                    'starts_at'    => $cmd->startsAt->format(\DateTimeInterface::ATOM),
                    'email'        => $cmd->guestEmail,
                ]);
                throw new \DomainException('Dieser Tisch ist für das gewählte Datum gesperrt und kann nicht reserviert werden.');
            }

            $reservation->setTableNumber($cmd->tableNumber);

            // Explizit gewählter Tisch: direkt bestätigen (Widget-seitig ist kein
            // ausstehend-Modus beim manuellen Tischplan-Modus vorgesehen).
            $uiSettings             = $tenant->getUiSettings() ?? [];
            $ausstehendBestaetigung = (bool) ($uiSettings['widgetFunctional']['ausstehendBestaetigung'] ?? false);
            if (!$ausstehendBestaetigung) {
                $reservation->confirm();
            }
        }

        // Mehrfach-Tischauswahl (zusammengelegte Tische) — unabhängig vom obigen
        // Zweig, da der Admin z.B. für eine große Personenzahl mehrere Tische
        // gleichzeitig auswählt. $cmd->tableNumber ist dabei bereits der erste
        // Tisch der Auswahl; hier wird die vollständige Liste persistiert.
        if ($cmd->tableIds !== null && count($cmd->tableIds) > 0) {
            $reservation->setTableIds(array_map('intval', $cmd->tableIds));
        }

        if ($cmd->source !== null) {
            $reservation->setSource($cmd->source);
        }

        if ($cmd->hotelRoomNumber !== null) {
            $reservation->setHotelRoomNumber($cmd->hotelRoomNumber);
        }

        if ($cmd->packages !== null && count($cmd->packages) > 0) {
            $availablePackages = $tenant->getUiSettings()['packages'] ?? [];
            $totalQuantity     = 0;

            foreach ($cmd->packages as $selection) {
                $packageId = (string) ($selection['package_id'] ?? '');
                $quantity  = (int) ($selection['quantity'] ?? 0);

                if ($packageId === '' || $quantity < 1) {
                    throw new \DomainException('Ungültige Package-Auswahl.');
                }

                $package = null;
                foreach ($availablePackages as $p) {
                    if (($p['id'] ?? null) === $packageId) {
                        $package = $p;
                        break;
                    }
                }
                if ($package === null || empty($package['active'])) {
                    throw new \DomainException('Das gewählte Package ist nicht verfügbar.');
                }

                $totalQuantity += $quantity;
                if ($totalQuantity > $cmd->partySize) {
                    throw new \DomainException('Die Anzahl der gewählten Packages darf die Personenzahl nicht überschreiten.');
                }

                $reservation->addPackage(
                    $packageId,
                    $package['name'] ?? '',
                    isset($package['pricePerPerson']) ? (int) $package['pricePerPerson'] : null,
                    $quantity,
                );
            }
        }

        $reservation->setGuest($guest);
        $guest->incrementReservations();

        if ($cmd->performedByEmployeeNumber !== null && $cmd->performedByName !== null) {
            $reservation->recordStaffAction($cmd->performedByEmployeeNumber, $cmd->performedByName, 'created');
        }

        // Beide Entities in einem einzigen flush persistieren — atomar.
        // Würden wir zweimal save() aufrufen, hätten wir zwei Transaktionen:
        // Wenn die zweite schlägt, wäre der Gäste-Counter bereits hochgezählt.
        $this->em->persist($guest);
        $this->em->persist($reservation);
        $this->em->flush();

        $this->logger->info('Reservierung erstellt', [
            'reservation_id' => $reservation->getId()->toRfc4122(),
            'venue_id'       => $cmd->venueId,
            'email'          => $cmd->guestEmail,
            'starts_at'      => $cmd->startsAt->format(\DateTimeInterface::ATOM),
            'party_size'     => $cmd->partySize,
            'table_number'   => $reservation->getTableNumber(),
        ]);

        $this->bus->dispatch(new SendConfirmationEmail(
            reservationId:    $reservation->getId()->toRfc4122(),
            guestEmail:       $cmd->guestEmail,
            guestName:        $cmd->guestName,
            reservationToken: $reservation->getToken(),
            startsAt:         $reservation->getStartsAt()->format('d.m.Y H:i'),
            partySize:        $cmd->partySize,
            venueName:        $venue->getName(),
            tenantId:         $tenant->getId()->toRfc4122(),
        ));

        $this->bus->dispatch(new PushReservationToPms(
            $reservation->getId()->toRfc4122(),
            $tenant->getId()->toRfc4122(),
        ));

        return $reservation;
    }

    private function isTableBlocked(Venue $venue, int $tableNumber, \DateTimeImmutable $startsAt): bool
    {
        $blocks = $this->tableBlockRepo->findByVenueAndTable($venue, $tableNumber);
        foreach ($blocks as $block) {
            if ($block->isActiveAt($startsAt)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Ein Gast gilt auch dann als gesperrt, wenn sein No-Show-Zähler den
     * aktuell konfigurierten Schwellenwert erreicht/überschreitet — auch wenn
     * das persistierte "blocked"-Flag (noch) nicht gesetzt ist, weil der
     * Schwellenwert erst nach dem letzten No-Show geändert wurde.
     */
    private function isEffectivelyBlocked(Guest $guest, Tenant $tenant): bool
    {
        if ($guest->isBlocked()) {
            return true;
        }

        $uiSettings = $tenant->getUiSettings() ?? [];
        $threshold  = isset($uiSettings['noShowAutoBlockThreshold'])
            ? (int) $uiSettings['noShowAutoBlockThreshold']
            : null;

        return $threshold !== null && $guest->getNoShowCount() >= $threshold;
    }

    /** Clean-up-Zeit in Minuten — 0 wenn der Schalter in den Tenant-Settings aus ist. */
    private function cleanupMinutes(array $uiSettings): int
    {
        $timing = $uiSettings['reservationTiming'] ?? [];
        if (empty($timing['cleanupEnabled'])) {
            return 0;
        }
        return (int) ($timing['cleanupMinutes'] ?? 0);
    }

    /**
     * Findet den kleinsten verfügbaren Tisch der mind. $partySize Plätze hat
     * und im Zeitfenster [$startsAt, $endsAt) noch nicht belegt ist.
     *
     * @param array<int, array<string, mixed>> $tables  Aus venue->getLayout()['tables']
     */
    private function findBestTable(
        string $venueId,
        int $partySize,
        \DateTimeImmutable $startsAt,
        \DateTimeImmutable $endsAt,
        array $tables,
        Venue $venue,
        int $cleanupMinutes = 0,
    ): ?int {
        if (empty($tables)) {
            return null;
        }

        // Clean-up-Zeit symmetrisch auf beide Seiten des gesuchten Fensters anwenden —
        // das hält automatisch den gewünschten Puffer zu JEDER Nachbar-Reservierung
        // ein, egal ob sie davor oder danach liegt. cleanupMinutes=0 (Schalter aus)
        // ergibt exakt die bisherige Abfrage ohne Puffer.
        $windowStart = $cleanupMinutes > 0 ? $startsAt->modify("-{$cleanupMinutes} minutes") : $startsAt;
        $windowEnd   = $cleanupMinutes > 0 ? $endsAt->modify("+{$cleanupMinutes} minutes")   : $endsAt;

        // Bereits belegte Tischnummern im gewünschten Zeitfenster (inkl. Clean-up-Puffer) abfragen
        $bookedNumbers = $this->dbal->fetchFirstColumn(
            'SELECT DISTINCT r.table_number
               FROM reservations r
              WHERE r.venue_id    = UNHEX(REPLACE(:venueId, \'-\', \'\'))
                AND r.table_number IS NOT NULL
                AND r.status      NOT IN (\'cancelled\', \'completed\', \'no_show\')
                AND r.starts_at   < :endsAt
                AND r.ends_at     > :startsAt',
            [
                'venueId'  => $venueId,
                'startsAt' => $windowStart->format('Y-m-d H:i:s'),
                'endsAt'   => $windowEnd->format('Y-m-d H:i:s'),
            ],
        );

        $bookedSet = array_map('intval', $bookedNumbers);

        // Passende Tische: nicht belegt, Kapazität >= Personenzahl
        $candidates = [];
        foreach ($tables as $t) {
            // Frontend speichert Tische mit Key 'id' (PlacedTable.id).
            // Fallback auf 'number' für Rückwärtskompatibilität.
            $num   = isset($t['id'])     ? (int) $t['id']
                   : (isset($t['number']) ? (int) $t['number'] : null);
            $seats = isset($t['seats'])  ? (int) $t['seats']  : 0;

            if ($num === null || $seats < $partySize) {
                continue;
            }
            if (in_array($num, $bookedSet, true)) {
                continue;
            }
            if ($this->isTableBlocked($venue, $num, $startsAt)) {
                continue;
            }

            $candidates[] = ['number' => $num, 'seats' => $seats];
        }

        if (empty($candidates)) {
            return null;
        }

        // Besten Fit: kleinste Kapazität die noch ausreicht (minimiert "Verschwendung")
        usort($candidates, static fn ($a, $b) => $a['seats'] - $b['seats']);

        return $candidates[0]['number'];
    }
}
