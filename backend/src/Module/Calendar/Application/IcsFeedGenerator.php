<?php

declare(strict_types=1);

namespace App\Module\Calendar\Application;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Tenant\Domain\Entity\Tenant;

/**
 * Erzeugt eine iCalendar-Datei (RFC 5545) aus einer Liste von Reservierungen —
 * für den privaten Kalender-Abo-Link (Google Calendar/Apple Kalender/Outlook
 * "Kalender per URL abonnieren"). Reiner Read-Only-Export, keine externe
 * Bibliothek nötig; Zeiten werden als lokale Wanduhrzeit mit TZID (statt UTC-
 * Konvertierung) ausgegeben, da Reservation::startsAt/endsAt bereits die
 * lokale Uhrzeit des Venues repräsentieren (siehe CreateReservationHandler —
 * keine Zeitzonen-Konvertierung an anderer Stelle im System).
 *
 * TZID ohne eingebettetes VTIMEZONE-Block ist technisch eine Abweichung von
 * RFC 5545, wird aber von allen gängigen Kalender-Clients (Google, Apple,
 * Outlook) anhand des IANA-Namens zuverlässig interpretiert — dieselbe Praxis
 * wie bei den meisten realen ICS-Feeds im Web.
 */
final class IcsFeedGenerator
{
    private const PRODID = '-//Salyseat//Reservierungen//DE';

    /** @param Reservation[] $reservations */
    public function generate(Tenant $tenant, array $reservations): string
    {
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:' . self::PRODID,
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:' . $this->escape($tenant->getName() . ' — Reservierungen'),
            'X-WR-TIMEZONE:' . $this->defaultTimezone($reservations),
        ];

        foreach ($reservations as $reservation) {
            array_push($lines, ...$this->buildEvent($reservation));
        }

        $lines[] = 'END:VCALENDAR';

        return $this->fold($lines);
    }

    /** @return string[] */
    private function buildEvent(Reservation $reservation): array
    {
        $venue = $reservation->getVenue();
        $tzid  = $venue->getTimezone();
        $now   = (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Ymd\THis\Z');

        $descriptionParts = [];
        if ($reservation->getTableNumber() !== null) {
            $descriptionParts[] = 'Tisch ' . $reservation->getTableNumber();
        }
        $descriptionParts[] = $reservation->getPartySize() . ' Personen';
        if ($reservation->getOccasion() !== null && $reservation->getOccasion() !== '') {
            $descriptionParts[] = 'Anlass: ' . $reservation->getOccasion();
        }
        if ($reservation->getGuestPhone() !== null && $reservation->getGuestPhone() !== '') {
            $descriptionParts[] = 'Tel: ' . $reservation->getGuestPhone();
        }
        if ($reservation->getGuestNotes() !== null && $reservation->getGuestNotes() !== '') {
            $descriptionParts[] = 'Notiz: ' . $reservation->getGuestNotes();
        }

        $guestDisplayName = trim(($reservation->getGuestFirstName() ?? '') . ' ' . $reservation->getGuestName());
        $summary = $guestDisplayName . ' (' . $reservation->getPartySize() . ' Pers.)';
        if ($reservation->getOccasion() !== null && $reservation->getOccasion() !== '') {
            $summary .= ' — ' . $reservation->getOccasion();
        }

        return [
            'BEGIN:VEVENT',
            'UID:' . $reservation->getId()->toRfc4122() . '@salyseat',
            'DTSTAMP:' . $now,
            'DTSTART;TZID=' . $tzid . ':' . $reservation->getStartsAt()->format('Ymd\THis'),
            'DTEND;TZID=' . $tzid . ':' . $reservation->getEndsAt()->format('Ymd\THis'),
            'SUMMARY:' . $this->escape($summary),
            'DESCRIPTION:' . $this->escape(implode("\n", $descriptionParts)),
            'LOCATION:' . $this->escape($venue->getName()),
            'STATUS:' . $this->icsStatus($reservation->getStatus()),
            'SEQUENCE:0',
            'END:VEVENT',
        ];
    }

    private function icsStatus(string $reservationStatus): string
    {
        return match ($reservationStatus) {
            'pending' => 'TENTATIVE',
            default   => 'CONFIRMED',
        };
    }

    /** @param Reservation[] $reservations */
    private function defaultTimezone(array $reservations): string
    {
        $first = $reservations[0] ?? null;
        return $first?->getVenue()->getTimezone() ?? 'Europe/Berlin';
    }

    /** Escaping nach RFC 5545 §3.3.11 (TEXT-Wert). */
    private function escape(string $value): string
    {
        $value = str_replace(['\\', ';', ',', "\r\n", "\n"], ['\\\\', '\\;', '\\,', '\\n', '\\n'], $value);
        return $value;
    }

    /**
     * Zeilenumbruch nach RFC 5545 §3.1: Zeilen dürfen max. 75 Oktette lang
     * sein, längere werden mit CRLF + einem Leerzeichen als Fortsetzung
     * gefaltet. Multi-byte-sicher (UTF-8-Zeichen werden nicht mitten
     * auseinandergeschnitten).
     *
     * @param string[] $lines
     */
    private function fold(array $lines): string
    {
        $out = [];
        foreach ($lines as $line) {
            $out[] = $this->foldLine($line);
        }
        return implode("\r\n", $out) . "\r\n";
    }

    private function foldLine(string $line): string
    {
        $bytes = strlen($line);
        if ($bytes <= 75) {
            return $line;
        }

        $chunks = [];
        $pos    = 0;
        $limit  = 75;

        while ($pos < $bytes) {
            $take = min($limit, $bytes - $pos);
            // Nicht mitten in einem UTF-8-Multibyte-Zeichen schneiden.
            while ($take > 0 && $pos + $take < $bytes && (ord($line[$pos + $take]) & 0xC0) === 0x80) {
                $take--;
            }
            $chunks[] = substr($line, $pos, $take);
            $pos     += $take;
            $limit    = 74; // Fortsetzungszeilen: 1 Byte für das führende Leerzeichen abziehen
        }

        return implode("\r\n ", $chunks);
    }
}
