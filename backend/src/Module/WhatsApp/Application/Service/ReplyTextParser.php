<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application\Service;

/**
 * Kleine, reine Parser für Freitext-Antworten im WhatsApp-Buchungsdialog.
 * Bewusst tolerant (Umlaute, Groß/Klein, führendes/nachfolgendes Rauschen wie
 * "für 4 Personen bitte") statt strikt auf exakte Formate zu bestehen — echte
 * Chat-Nutzer tippen nicht wie in ein Formular.
 */
final class ReplyTextParser
{
    private const WEEKDAYS = [
        'montag' => 1, 'dienstag' => 2, 'mittwoch' => 3, 'donnerstag' => 4,
        'freitag' => 5, 'samstag' => 6, 'sonntag' => 7,
    ];

    /** @return int|null 1-50, oder null wenn keine plausible Personenzahl gefunden wurde. */
    public function parsePartySize(string $text): ?int
    {
        if (preg_match('/(\d{1,2})/', $text, $m) !== 1) {
            return null;
        }
        $n = (int) $m[1];
        return ($n >= 1 && $n <= 50) ? $n : null;
    }

    /**
     * Erkennt "heute", "morgen", Wochentagsnamen (nächstes Vorkommen) und
     * dd.mm[.yyyy]. Gibt null zurück, wenn nichts erkannt wurde.
     */
    public function parseDate(string $text, \DateTimeImmutable $now): ?\DateTimeImmutable
    {
        $normalized = mb_strtolower(trim($text));

        if (str_contains($normalized, 'heute')) {
            return $now;
        }
        if (str_contains($normalized, 'morgen') && !str_contains($normalized, 'übermorgen')) {
            return $now->modify('+1 day');
        }
        if (str_contains($normalized, 'übermorgen')) {
            return $now->modify('+2 days');
        }

        foreach (self::WEEKDAYS as $name => $isoWeekday) {
            if (str_contains($normalized, $name)) {
                $current = (int) $now->format('N');
                $daysAhead = ($isoWeekday - $current + 7) % 7;
                $daysAhead = $daysAhead === 0 ? 7 : $daysAhead; // "Montag" am Montag gemeint = nächster Montag
                return $now->modify("+{$daysAhead} days");
            }
        }

        // dd.mm[.yyyy] — auch d.m. ohne führende Null
        if (preg_match('/(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?/', $normalized, $m) === 1) {
            $day   = (int) $m[1];
            $month = (int) $m[2];
            $year  = isset($m[3]) && $m[3] !== ''
                ? (int) (strlen($m[3]) === 2 ? '20' . $m[3] : $m[3])
                : (int) $now->format('Y');

            try {
                $date = new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day));
            } catch (\Exception) {
                return null;
            }

            // Datum liegt in der Vergangenheit und kein Jahr wurde genannt -> nächstes Jahr gemeint
            if (!isset($m[3]) || $m[3] === '') {
                if ($date < $now->modify('-1 day')) {
                    $date = $date->modify('+1 year');
                }
            }

            return $date;
        }

        return null;
    }

    public function parseYesNo(string $text): ?bool
    {
        $normalized = mb_strtolower(trim($text));

        $yes = ['ja', 'yes', 'jep', 'jap', 'stimmt', 'passt', 'genau', 'korrekt', 'ok', 'okay', 'bestätigt', 'bestaetigt'];
        $no  = ['nein', 'no', 'nope', 'abbrechen', 'stop', 'falsch', 'ändern', 'aendern'];

        foreach ($yes as $w) {
            if ($normalized === $w || str_starts_with($normalized, $w . ' ')) {
                return true;
            }
        }
        foreach ($no as $w) {
            if ($normalized === $w || str_starts_with($normalized, $w . ' ')) {
                return false;
            }
        }

        return null;
    }

    /**
     * Ordnet eine Antwort einer zuvor angebotenen Uhrzeiten-Liste zu — entweder
     * per Nummer ("2" -> zweiter Eintrag) oder per exakter HH:MM-Angabe.
     *
     * @param string[] $offeredSlots
     */
    public function parseTimeSelection(string $text, array $offeredSlots): ?string
    {
        $trimmed = trim($text);

        if (preg_match('/^(\d{1,2})$/', $trimmed, $m) === 1) {
            $index = ((int) $m[1]) - 1;
            return $offeredSlots[$index] ?? null;
        }

        if (preg_match('/(\d{1,2})[:.](\d{2})/', $trimmed, $m) === 1) {
            $candidate = sprintf('%02d:%02d', (int) $m[1], (int) $m[2]);
            return in_array($candidate, $offeredSlots, true) ? $candidate : null;
        }

        return null;
    }
}