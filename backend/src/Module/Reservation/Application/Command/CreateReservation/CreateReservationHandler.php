<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Command\CreateReservation;

use App\Messenger\Message\SendConfirmationEmail;
use App\Module\Reservation\Domain\Entity\Guest;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\GuestRepositoryInterface;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Messenger\MessageBusInterface;

final class CreateReservationHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GuestRepositoryInterface $guests,
        private readonly MessageBusInterface $bus,
        private readonly Connection $dbal,
    ) {}

    public function __invoke(CreateReservationCommand $cmd): Reservation
    {
        $venue = $this->em->getRepository(Venue::class)->find($cmd->venueId)
            ?? throw new \DomainException('Venue nicht gefunden.');

        if (!$venue->isActive()) {
            throw new \DomainException('Dieses Venue nimmt aktuell keine Buchungen an.');
        }

        $tenant = $venue->getTenant();

        $guest = $this->guests->findByTenantAndEmail($tenant->getId(), $cmd->guestEmail);

        if ($guest === null) {
            $guest = new Guest($tenant, $cmd->guestName, $cmd->guestEmail);
            if ($cmd->guestPhone !== null) {
                $guest->setPhone($cmd->guestPhone);
            }
        }

        if ($guest->isBlocked() && !$cmd->adminOverride) {
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
        // Wenn kein Tisch explizit gewählt wurde (tischartenAktiv=false oder Plan-Modus
        // ohne Auswahl), versuchen wir den passendsten freien Tisch zu finden.
        if ($cmd->tableNumber === null) {
            $uiSettings              = $tenant->getUiSettings() ?? [];
            $ausstehendBestaetigung  = (bool) ($uiSettings['widgetFunctional']['ausstehendBestaetigung'] ?? false);

            $tableNumber = $this->findBestTable(
                venueId:   $venue->getId()->toRfc4122(),
                partySize: $cmd->partySize,
                startsAt:  $cmd->startsAt,
                endsAt:    $endsAt,
                tables:    $venue->getLayout()['tables'] ?? [],
            );

            if ($tableNumber !== null) {
                $reservation->setTableNumber($tableNumber);
                // Nur bestätigen wenn kein "ausstehende Bestätigung"-Modus aktiv ist.
                if (!$ausstehendBestaetigung) {
                    $reservation->confirm();
                }
            }
            // Kein Tisch verfügbar → Reservierung bleibt pending/ohne Tisch
        } else {
            $reservation->setTableNumber($cmd->tableNumber);

            // Explizit gewählter Tisch: direkt bestätigen (Widget-seitig ist kein
            // ausstehend-Modus beim manuellen Tischplan-Modus vorgesehen).
            $uiSettings             = $tenant->getUiSettings() ?? [];
            $ausstehendBestaetigung = (bool) ($uiSettings['widgetFunctional']['ausstehendBestaetigung'] ?? false);
            if (!$ausstehendBestaetigung) {
                $reservation->confirm();
            }
        }

        $reservation->setGuest($guest);
        $guest->incrementReservations();

        // Beide Entities in einem einzigen flush persistieren — atomar.
        // Würden wir zweimal save() aufrufen, hätten wir zwei Transaktionen:
        // Wenn die zweite schlägt, wäre der Gäste-Counter bereits hochgezählt.
        $this->em->persist($guest);
        $this->em->persist($reservation);
        $this->em->flush();

        $this->bus->dispatch(new SendConfirmationEmail(
            reservationId:    $reservation->getId()->toRfc4122(),
            guestEmail:       $cmd->guestEmail,
            guestName:        $cmd->guestName,
            reservationToken: $reservation->getToken(),
            startsAt:         $reservation->getStartsAt()->format(\DateTimeInterface::ATOM),
            partySize:        $cmd->partySize,
            venueName:        $venue->getName(),
            tenantId:         $tenant->getId()->toRfc4122(),
        ));

        return $reservation;
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
    ): ?int {
        if (empty($tables)) {
            return null;
        }

        // Bereits belegte Tischnummern im gewünschten Zeitfenster abfragen
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
                'startsAt' => $startsAt->format('Y-m-d H:i:s'),
                'endsAt'   => $endsAt->format('Y-m-d H:i:s'),
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
