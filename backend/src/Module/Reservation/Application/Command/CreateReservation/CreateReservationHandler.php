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

        // Dauer vorab berechnen — wird sowohl für die Raumsperrungs-Prüfung
        // (volles Zeitfenster statt nur Startzeitpunkt) als auch weiter unten
        // für die eigentliche Reservierung gebraucht.
        $endsAt = $cmd->startsAt->modify(sprintf('+%d minutes', $cmd->durationMinutes ?? $venue->getEffectiveDefaultDurationMinutes()));

        // Raumsperrung prüfen — gegen das volle Zeitfenster [startsAt, endsAt),
        // nicht nur den Startzeitpunkt. Sonst würde eine Sperre wie 20:30–21:00
        // eine um 20:00 beginnende, bis 21:30 laufende Reservierung nicht
        // erkennen, obwohl sie in die Sperrzeit hineinragt.
        $dateStr    = $cmd->startsAt->format('Y-m-d');
        $timeStr    = $cmd->startsAt->format('H:i');
        $endTimeStr = $endsAt->format('Y-m-d') === $dateStr ? $endsAt->format('H:i') : '24:00';
        $venueBlock = $this->dbal->fetchOne(
            'SELECT id FROM venue_blocks
              WHERE venue_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND date_from <= ? AND date_to >= ?
                AND (full_day = 1 OR (time_from < ? AND time_to > ?))
              LIMIT 1',
            [$venue->getId()->toRfc4122(), $dateStr, $dateStr, $endTimeStr, $timeStr],
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

        $reservation = new Reservation(
            $venue,
            $cmd->guestName,
            $cmd->guestEmail,
            $cmd->partySize,
            $cmd->startsAt,
            $endsAt,
            $cmd->guestPhone,
            $cmd->guestNotes,
            $cmd->guestFirstName,
            $cmd->occasion,
        );
        // ─── Race-Condition-Schutz ──────────────────────────────────────────────
        // Zwischen "ist der Tisch frei?" (Lesen) und dem tatsächlichen Speichern
        // lag bisher kein Schutz gegen parallele Requests: zwei gleichzeitige
        // Buchungen für denselben Tisch/Zeitraum konnten beide die Prüfung als
        // "frei" bestehen und beide gespeichert werden (Doppelbuchung). Ein
        // MySQL Named Lock pro Venue serialisiert alle Buchungsversuche für
        // dasselbe Venue, sodass Prüfung+Speichern je Request atomar wirkt —
        // ohne den dynamischen JSON-Tischplan in ein klassisches Row-Level-
        // Locking-Schema pressen zu müssen. Andere Venues sind von diesem Lock
        // nicht betroffen und können weiterhin parallel buchen.
        $lockName = 'reservation_create:' . $venue->getId()->toRfc4122();
        $lockAcquired = (int) $this->dbal->fetchOne('SELECT GET_LOCK(?, ?)', [$lockName, 10]);
        if ($lockAcquired !== 1) {
            $this->logger->error('Konnte Buchungs-Lock nicht erhalten (Timeout)', [
                'venue_id' => $cmd->venueId,
            ]);
            throw new \DomainException('Der Buchungsvorgang ist gerade stark ausgelastet. Bitte versuche es in einem Moment erneut.');
        }

        try {
            // ─── Automatische Tischzuweisung ──────────────────────────────────────
            // Nur im Widget-Flow (adminOverride=false): passendsten freien Tisch suchen.
            // Admin-Reservierungen ohne expliziten Tisch bleiben bewusst auf Warteliste —
            // der Admin weist den Tisch manuell zu.
            if ($cmd->tableNumber === null) {
                if (!$cmd->adminOverride) {
                    $uiSettings             = $tenant->getUiSettings() ?? [];
                    $ausstehendBestaetigung = $this->isAusstehendBestaetigungActive($uiSettings, $cmd->startsAt);

                    $tableNumbers = $this->findBestTable(
                        venueId:        $venue->getId()->toRfc4122(),
                        partySize:      $cmd->partySize,
                        startsAt:       $cmd->startsAt,
                        endsAt:         $endsAt,
                        tables:         $venue->getLayout()['tables'] ?? [],
                        venue:          $venue,
                        cleanupMinutes: $this->cleanupMinutes($uiSettings),
                    );

                    if ($tableNumbers !== null) {
                        $reservation->setTableNumber($tableNumbers[0]);
                        // Mehrere Tische (automatisch kombiniert, siehe findBestTable):
                        // vollständige Liste zusätzlich in table_ids persistieren, damit
                        // ALLE beteiligten Tische korrekt als belegt gelten (Anzeige im
                        // Tischplan, künftige Verfügbarkeitsprüfung, Admin-Ansicht).
                        if (count($tableNumbers) > 1) {
                            $reservation->setTableIds($tableNumbers);
                        }
                        // Nur bestätigen wenn kein "ausstehende Bestätigung"-Modus aktiv ist.
                        if (!$ausstehendBestaetigung) {
                            $reservation->confirm();
                        }
                    }
                }
                // Kein Tisch / Admin ohne Tischauswahl → Reservierung bleibt pending (Warteliste)
            } else {
                // Prüfen ob der explizit gewählte Tisch gesperrt ist
                if ($this->isTableBlocked($venue, $cmd->tableNumber, $cmd->startsAt, $endsAt)) {
                    $this->logger->warning('Reservierungsversuch auf gesperrtem Tisch abgelehnt', [
                        'venue_id'     => $cmd->venueId,
                        'table_number' => $cmd->tableNumber,
                        'starts_at'    => $cmd->startsAt->format(\DateTimeInterface::ATOM),
                        'email'        => $cmd->guestEmail,
                    ]);
                    throw new \DomainException('Dieser Tisch ist für das gewählte Datum gesperrt und kann nicht reserviert werden.');
                }

                // Kapazität prüfen — anders als bei der automatischen Zuweisung
                // (findBestTable(), die seats >= partySize immer beachtet) wurde
                // bei explizit gewählten Tischen bislang gar nicht geprüft, ob
                // der Tisch überhaupt genug Plätze für die Personenzahl hat.
                // Bei kombinierten Tischen (mehrere Tische gleichzeitig gewählt,
                // s. $cmd->tableIds unten) zählt die SUMME aller beteiligten
                // Tische, nicht nur der hier übergebene erste ($cmd->tableNumber).
                $comboTableNumbers = ($cmd->tableIds !== null && count($cmd->tableIds) > 1)
                    ? array_map('intval', $cmd->tableIds)
                    : [$cmd->tableNumber];
                $totalSeats = $this->totalSeatsForTables($venue, $comboTableNumbers);
                if ($totalSeats !== null && $totalSeats < $cmd->partySize) {
                    $this->logger->warning('Reservierungsversuch mit zu kleinem Tisch abgelehnt', [
                        'venue_id'     => $cmd->venueId,
                        'table_number' => $cmd->tableNumber,
                        'party_size'   => $cmd->partySize,
                        'total_seats'  => $totalSeats,
                        'email'        => $cmd->guestEmail,
                    ]);
                    throw new \DomainException('Der gewählte Tisch bietet nicht genug Plätze für die angegebene Personenzahl.');
                }

                // Zusätzlich gegen bestehende Reservierungen prüfen — isTableBlocked()
                // oben deckt nur manuelle Admin-Sperren ab, NICHT ob der Tisch bereits
                // durch eine andere Reservierung im selben Zeitraum belegt ist. Ohne
                // diese Prüfung konnte ein Gast einen längst gebuchten Tisch erneut
                // reservieren (z. B. über die Tischplan-Auswahl im Widget).
                $uiSettings     = $tenant->getUiSettings() ?? [];
                $cleanupMinutes = $this->cleanupMinutes($uiSettings);
                $windowStart    = $cleanupMinutes > 0 ? $cmd->startsAt->modify("-{$cleanupMinutes} minutes") : $cmd->startsAt;
                $windowEnd      = $cleanupMinutes > 0 ? $endsAt->modify("+{$cleanupMinutes} minutes")       : $endsAt;
                $bookedSet      = $this->getBookedTableNumbers($venue->getId()->toRfc4122(), $windowStart, $windowEnd);

                if (isset($bookedSet[$cmd->tableNumber])) {
                    $this->logger->warning('Reservierungsversuch auf bereits belegtem Tisch abgelehnt', [
                        'venue_id'     => $cmd->venueId,
                        'table_number' => $cmd->tableNumber,
                        'starts_at'    => $cmd->startsAt->format(\DateTimeInterface::ATOM),
                        'email'        => $cmd->guestEmail,
                    ]);
                    throw new \DomainException('Dieser Tisch ist für den gewählten Zeitraum bereits belegt. Bitte wähle einen anderen Tisch oder eine andere Uhrzeit.');
                }

                $reservation->setTableNumber($cmd->tableNumber);

                // Explizit gewählter Tisch: direkt bestätigen, außer die "ausstehende
                // Bestätigung"-Regel (inkl. Tage-/Uhrzeiten-Eingrenzung) greift für
                // diesen Termin.
                $ausstehendBestaetigung = $this->isAusstehendBestaetigungActive($uiSettings, $cmd->startsAt);
                if (!$ausstehendBestaetigung) {
                    $reservation->confirm();
                }
            }

            // Mehrfach-Tischauswahl (zusammengelegte Tische) — unabhängig vom obigen
            // Zweig, da der Admin z.B. für eine große Personenzahl mehrere Tische
            // gleichzeitig auswählt. $cmd->tableNumber ist dabei bereits der erste
            // Tisch der Auswahl; hier wird die vollständige Liste persistiert.
            if ($cmd->tableIds !== null && count($cmd->tableIds) > 0) {
                $explicitTableIds = array_map('intval', $cmd->tableIds);

                // Belegungsstand separat ermitteln (nicht die $bookedSet-Variable aus
                // dem obigen tableNumber-Zweig wiederverwenden — die existiert nicht,
                // wenn dieser Zweig für die automatische Zuweisung durchlaufen wird).
                $tableIdsUiSettings = $tenant->getUiSettings() ?? [];
                $tableIdsCleanup    = $this->cleanupMinutes($tableIdsUiSettings);
                $tableIdsWinStart   = $tableIdsCleanup > 0 ? $cmd->startsAt->modify("-{$tableIdsCleanup} minutes") : $cmd->startsAt;
                $tableIdsWinEnd     = $tableIdsCleanup > 0 ? $endsAt->modify("+{$tableIdsCleanup} minutes")       : $endsAt;
                $tableIdsBookedSet  = $this->getBookedTableNumbers($venue->getId()->toRfc4122(), $tableIdsWinStart, $tableIdsWinEnd);

                // Jeden weiteren Tisch der Auswahl ebenfalls gegen Sperrungen UND
                // bestehende Reservierungen prüfen (oben wird nur $cmd->tableNumber
                // geprüft — ohne diese Schleife könnte ein gesperrter oder bereits
                // gebuchter Zusatztisch unbemerkt mitreserviert werden).
                foreach ($explicitTableIds as $extraTableId) {
                    if ($this->isTableBlocked($venue, $extraTableId, $cmd->startsAt, $endsAt)) {
                        $this->logger->warning('Reservierungsversuch auf gesperrtem Tisch (Mehrfachauswahl) abgelehnt', [
                            'venue_id'     => $cmd->venueId,
                            'table_number' => $extraTableId,
                            'starts_at'    => $cmd->startsAt->format(\DateTimeInterface::ATOM),
                            'email'        => $cmd->guestEmail,
                        ]);
                        throw new \DomainException('Einer der gewählten Tische ist für das gewählte Datum gesperrt und kann nicht reserviert werden.');
                    }
                    if (isset($tableIdsBookedSet[$extraTableId])) {
                        $this->logger->warning('Reservierungsversuch auf bereits belegtem Tisch (Mehrfachauswahl) abgelehnt', [
                            'venue_id'     => $cmd->venueId,
                            'table_number' => $extraTableId,
                            'starts_at'    => $cmd->startsAt->format(\DateTimeInterface::ATOM),
                            'email'        => $cmd->guestEmail,
                        ]);
                        throw new \DomainException('Einer der gewählten Tische ist für den gewählten Zeitraum bereits belegt. Bitte wähle eine andere Auswahl oder Uhrzeit.');
                    }
                }

                $reservation->setTableIds($explicitTableIds);
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
        } finally {
            // Lock in jedem Fall freigeben — auch bei einer DomainException
            // (z. B. gesperrter Tisch) weiter oben im try-Block.
            $this->dbal->executeStatement('SELECT RELEASE_LOCK(?)', [$lockName]);
        }

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
            guestFirstName:   $cmd->guestFirstName,
            occasion:         $cmd->occasion,
        ));

        $this->bus->dispatch(new PushReservationToPms(
            $reservation->getId()->toRfc4122(),
            $tenant->getId()->toRfc4122(),
        ));

        return $reservation;
    }

    private function isTableBlocked(Venue $venue, int $tableNumber, \DateTimeImmutable $startsAt, \DateTimeImmutable $endsAt): bool
    {
        $blocks = $this->tableBlockRepo->findByVenueAndTable($venue, $tableNumber);
        foreach ($blocks as $block) {
            // Volles Zeitfenster prüfen (nicht nur den Startzeitpunkt) — sonst
            // würde eine Sperre, die z. B. erst nach Reservierungsbeginn
            // anfängt, aber noch während der Reservierung läuft, übersehen.
            if ($block->overlaps($startsAt, $endsAt)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Summiert die Plätze der übergebenen Tischnummern anhand des
     * Tischplans (venue->getLayout()['tables']) — für die Kapazitätsprüfung
     * bei explizit gewählten Tischen (s. __invoke()). Gleiche Nummer-Auflösung
     * wie in findBestTable() ('id' bevorzugt, Fallback 'number').
     *
     * Liefert null, wenn eine der angefragten Tischnummern im Tischplan
     * nicht gefunden wird — die Kapazitätsprüfung wird dann übersprungen,
     * statt eine Reservierung wegen einer Dateninkonsistenz zu blockieren.
     *
     * @param list<int> $tableNumbers
     */
    private function totalSeatsForTables(Venue $venue, array $tableNumbers): ?int
    {
        $seatsByNumber = [];
        foreach ($venue->getLayout()['tables'] ?? [] as $t) {
            $num = isset($t['id'])     ? (int) $t['id']
                 : (isset($t['number']) ? (int) $t['number'] : null);
            if ($num === null) {
                continue;
            }
            $seatsByNumber[$num] = isset($t['seats']) ? (int) $t['seats'] : 0;
        }

        $total = 0;
        foreach ($tableNumbers as $num) {
            if (!isset($seatsByNumber[$num])) {
                return null;
            }
            $total += $seatsByNumber[$num];
        }

        return $total;
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
     * Prüft, ob für diesen konkreten Termin die "ausstehende Bestätigung"
     * greifen soll. Berücksichtigt neben dem Haupt-Schalter auch die im
     * Widget-Einstellungen-UI konfigurierte Eingrenzung auf bestimmte Tage
     * (ausstehendScope/ausstehendDaten) und optional Uhrzeitfenster
     * (ausstehendUhrzeitAktiv/ausstehendUhrzeiten) — vorher wurde hier immer
     * nur der globale ausstehendBestaetigung-Schalter gelesen, wodurch die
     * feineren Einstellungen aus dem Admin-UI faktisch wirkungslos waren.
     */
    private function isAusstehendBestaetigungActive(array $uiSettings, \DateTimeImmutable $startsAt): bool
    {
        $functional = $uiSettings['widgetFunctional'] ?? [];

        if (!($functional['ausstehendBestaetigung'] ?? false)) {
            return false;
        }

        $scope = $functional['ausstehendScope'] ?? 'immer';
        if ($scope !== 'tage') {
            return true;
        }

        $dateStr = $startsAt->format('Y-m-d');
        $daten   = $functional['ausstehendDaten'] ?? [];
        if (!in_array($dateStr, $daten, true)) {
            return false;
        }

        if (!($functional['ausstehendUhrzeitAktiv'] ?? false)) {
            return true;
        }

        $timeStr = $startsAt->format('H:i');
        foreach (($functional['ausstehendUhrzeiten'] ?? []) as $fenster) {
            $von = $fenster['von'] ?? null;
            $bis = $fenster['bis'] ?? null;
            if ($von !== null && $bis !== null && $timeStr >= $von && $timeStr < $bis) {
                return true;
            }
        }

        return false;
    }

    /**
     * Findet die beste verfügbare Tisch-Zuweisung für die Personenzahl im
     * Zeitfenster [$startsAt, $endsAt). Passt kein einzelner Tisch, wird
     * automatisch eine Kombination mehrerer im Tischplan als "kombinierbar"
     * markierter Tische gesucht (siehe findBestCombination) — vorher wurde
     * die Reservierung in diesem Fall einfach auf "wartend" gesetzt, obwohl
     * z. B. zwei benachbarte 4er-Tische zusammen locker für 8 Personen
     * gereicht hätten.
     *
     * @param array<int, array<string, mixed>> $tables  Aus venue->getLayout()['tables']
     * @return list<int>|null  Liste der zugewiesenen Tischnummern (1 Eintrag = Einzeltisch)
     */
    private function findBestTable(
        string $venueId,
        int $partySize,
        \DateTimeImmutable $startsAt,
        \DateTimeImmutable $endsAt,
        array $tables,
        Venue $venue,
        int $cleanupMinutes = 0,
    ): ?array {
        if (empty($tables)) {
            return null;
        }

        // Clean-up-Zeit symmetrisch auf beide Seiten des gesuchten Fensters anwenden —
        // das hält automatisch den gewünschten Puffer zu JEDER Nachbar-Reservierung
        // ein, egal ob sie davor oder danach liegt. cleanupMinutes=0 (Schalter aus)
        // ergibt exakt die bisherige Abfrage ohne Puffer.
        $windowStart = $cleanupMinutes > 0 ? $startsAt->modify("-{$cleanupMinutes} minutes") : $startsAt;
        $windowEnd   = $cleanupMinutes > 0 ? $endsAt->modify("+{$cleanupMinutes} minutes")   : $endsAt;

        $bookedSet = $this->getBookedTableNumbers($venueId, $windowStart, $windowEnd);

        // Alle verfügbaren Tische (unabhängig von der Kapazität — auch kleine
        // Tische werden gebraucht, um Kombinationen zu bilden) mit Kapazität
        // und ggf. konfigurierten Kombinationspartnern sammeln.
        $available = [];
        foreach ($tables as $t) {
            // Frontend speichert Tische mit Key 'id' (PlacedTable.id).
            // Fallback auf 'number' für Rückwärtskompatibilität.
            $num   = isset($t['id'])     ? (int) $t['id']
                   : (isset($t['number']) ? (int) $t['number'] : null);
            $seats = isset($t['seats']) ? (int) $t['seats'] : 0;

            if ($num === null || $seats <= 0) {
                continue;
            }
            if (isset($bookedSet[$num])) {
                continue;
            }
            if ($this->isTableBlocked($venue, $num, $startsAt, $endsAt)) {
                continue;
            }

            $combinableWith = [];
            if (isset($t['combinableWith']) && is_array($t['combinableWith'])) {
                $combinableWith = array_values(array_unique(array_map('intval', $t['combinableWith'])));
            }

            $available[$num] = ['number' => $num, 'seats' => $seats, 'combinableWith' => $combinableWith];
        }

        if (empty($available)) {
            return null;
        }

        // 1) Einzelner Tisch, der allein reicht: kleinste ausreichende Kapazität
        //    (minimiert "Verschwendung").
        $singleCandidates = array_values(array_filter($available, static fn ($t) => $t['seats'] >= $partySize));
        if (!empty($singleCandidates)) {
            usort($singleCandidates, static fn ($a, $b) => $a['seats'] - $b['seats']);
            return [$singleCandidates[0]['number']];
        }

        // 2) Kein einzelner Tisch reicht aus: automatisch eine Kombination
        //    aus im Tischplan als "kombinierbar" markierten Nachbartischen suchen.
        return $this->findBestCombination($available, $partySize);
    }

    /**
     * Liefert alle durch eine Reservierung belegten Tischnummern. Bei
     * zusammengelegten Tischen (table_ids als JSON-Array) werden ALLE Tische
     * zurückgegeben, nicht nur der erste (table_number) — analog zu
     * AvailabilityService::resolveTableNumbers().
     *
     * @return list<int>
     */
    private function resolveBookedTableNumbers(mixed $tableNumber, mixed $tableIdsJson): array
    {
        $tableIds = [];
        if ($tableIdsJson !== null && $tableIdsJson !== '') {
            $decoded = json_decode((string) $tableIdsJson, true);
            if (is_array($decoded) && count($decoded) > 0) {
                $tableIds = array_values(array_unique(array_map('intval', $decoded)));
            } elseif (json_last_error() !== JSON_ERROR_NONE) {
                // Kaputtes table_ids-JSON würde sonst still auf nur table_number
                // zurückfallen — die übrigen tatsächlich belegten Kombi-Tische
                // gälten dann fälschlich als frei (Doppelbuchungsrisiko).
                $this->logger->error('Ungültiges table_ids-JSON beim Auflösen belegter Tische', [
                    'table_ids_raw' => (string) $tableIdsJson,
                    'json_error'    => json_last_error_msg(),
                ]);
            }
        }
        if (count($tableIds) > 0) {
            return $tableIds;
        }

        return ($tableNumber !== null && $tableNumber !== '') ? [(int) $tableNumber] : [];
    }

    /**
     * Liefert die Menge aller im Zeitfenster [$windowStart, $windowEnd) bereits
     * belegten Tischnummern für ein Venue (inkl. aufgelöster table_ids bei
     * zusammengelegten Reservierungen). Gemeinsam genutzt von findBestTable()
     * (automatische Zuweisung) UND der expliziten Tischauswahl — vorher prüfte
     * die explizite Auswahl nur gegen manuelle Admin-Sperren (isTableBlocked),
     * nie gegen bereits bestehende Reservierungen. Ein Gast konnte so einen
     * von einem anderen Gast längst gebuchten Tisch erneut reservieren.
     *
     * @return array<int, bool>  Tischnummer => true
     */
    private function getBookedTableNumbers(string $venueId, \DateTimeImmutable $windowStart, \DateTimeImmutable $windowEnd): array
    {
        $bookedRows = $this->dbal->fetchAllAssociative(
            'SELECT r.table_number AS tableNumber, r.table_ids AS tableIds
               FROM reservations r
              WHERE r.venue_id    = UNHEX(REPLACE(:venueId, \'-\', \'\'))
                AND r.status      NOT IN (\'cancelled\', \'completed\', \'no_show\')
                AND r.starts_at   < :endsAt
                AND r.ends_at     > :startsAt',
            [
                'venueId'  => $venueId,
                'startsAt' => $windowStart->format('Y-m-d H:i:s'),
                'endsAt'   => $windowEnd->format('Y-m-d H:i:s'),
            ],
        );

        $bookedSet = [];
        foreach ($bookedRows as $row) {
            foreach ($this->resolveBookedTableNumbers($row['tableNumber'], $row['tableIds']) as $num) {
                $bookedSet[$num] = true;
            }
        }
        return $bookedSet;
    }

    /**
     * Sucht unter den freien Tischen die beste zusammenhängende Kombination
     * (verknüpft über `combinableWith`, im Tischplan-Editor vom Admin einmalig
     * konfiguriert), deren Plätze zusammen für $partySize reichen.
     *
     * "Beste" heißt: möglichst wenig "Verschwendung" (kleinste ausreichende
     * Gesamtkapazität), bei Gleichstand die wenigsten Tische. Es werden NUR
     * Tische kombiniert, die der Admin explizit als nebeneinanderstehend /
     * kombinierbar markiert hat — nie beliebige freie Tische im selben Raum,
     * da die sonst quer im Restaurant verteilt sein könnten.
     *
     * @param array<int, array{number:int, seats:int, combinableWith:list<int>}> $available  Indiziert nach Tischnummer
     * @return list<int>|null
     */
    private function findBestCombination(array $available, int $partySize): ?array
    {
        // Gruppengröße bewusst begrenzt: in der Praxis werden selten mehr als
        // 3-4 Tische für eine Reservierung zusammengelegt; die Begrenzung
        // hält die Suche (Backtracking über die combinableWith-Graphen) auch
        // bei größeren Tischplänen performant.
        $maxGroupSize = 5;
        $best = null; // ['ids' => list<int>, 'totalSeats' => int]

        foreach ($available as $start) {
            $this->searchCombination(
                [$start['number']],
                $start['seats'],
                $available,
                $partySize,
                $maxGroupSize,
                $best,
            );
        }

        return $best !== null ? $best['ids'] : null;
    }

    /**
     * Backtracking-Suche über den combinableWith-Graphen: erweitert die
     * aktuell gewählte Tisch-Gruppe um Nachbarn JEDES bereits gewählten
     * Tisches (nicht nur des zuletzt hinzugefügten) — so werden auch
     * sternförmige Anordnungen erkannt, bei denen z. B. zwei Tische beide
     * neben einem dritten stehen, aber nicht direkt miteinander verknüpft
     * sind. Sobald die Gruppe groß genug ist, wird nicht weiter vergrößert
     * (mehr Tische als nötig würden nur unnötig weitere Tische blockieren).
     *
     * @param list<int> $chosenIds
     * @param array<int, array{number:int, seats:int, combinableWith:list<int>}> $available
     * @param array{ids:list<int>, totalSeats:int}|null $best
     */
    private function searchCombination(
        array $chosenIds,
        int $totalSeats,
        array $available,
        int $partySize,
        int $maxGroupSize,
        ?array &$best,
    ): void {
        if ($totalSeats >= $partySize) {
            if ($best === null
                || $totalSeats < $best['totalSeats']
                || ($totalSeats === $best['totalSeats'] && count($chosenIds) < count($best['ids']))
            ) {
                $best = ['ids' => $chosenIds, 'totalSeats' => $totalSeats];
            }
            return;
        }

        if (count($chosenIds) >= $maxGroupSize) {
            return;
        }

        $frontier = [];
        foreach ($chosenIds as $id) {
            foreach ($available[$id]['combinableWith'] ?? [] as $neighborId) {
                if (isset($available[$neighborId]) && !in_array($neighborId, $chosenIds, true)) {
                    $frontier[$neighborId] = true;
                }
            }
        }

        foreach (array_keys($frontier) as $nextId) {
            $this->searchCombination(
                [...$chosenIds, $nextId],
                $totalSeats + $available[$nextId]['seats'],
                $available,
                $partySize,
                $maxGroupSize,
                $best,
            );
        }
    }
}
