<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Calendar;

use App\Module\Calendar\Application\IcsFeedGenerator;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Venue\Domain\Entity\Venue;
use PHPUnit\Framework\TestCase;

final class IcsFeedGeneratorTest extends TestCase
{
    private IcsFeedGenerator $generator;
    private Tenant $tenant;
    private Venue $venue;

    protected function setUp(): void
    {
        $this->generator = new IcsFeedGenerator();
        $this->tenant    = new Tenant('Test-Restaurant', 'test-restaurant');
        $this->venue     = new Venue($this->tenant, 'Hauptraum', 'restaurant');
    }

    // ── Kalender-Rahmen ─────────────────────────────────────────────────────

    public function testLeererFeedEnthaeltNurKalenderRahmen(): void
    {
        $ics   = $this->generator->generate($this->tenant, []);
        $lines = $this->lines($ics);

        self::assertSame('BEGIN:VCALENDAR', $lines[0]);
        self::assertSame('END:VCALENDAR', $lines[array_key_last($lines)]);
        self::assertContains('VERSION:2.0', $lines);
        self::assertContains('PRODID:-//Salyseat//Reservierungen//DE', $lines);
        self::assertContains('CALSCALE:GREGORIAN', $lines);
        self::assertContains('METHOD:PUBLISH', $lines);
        self::assertStringNotContainsString('BEGIN:VEVENT', $ics);
    }

    public function testOhneReservierungenIstStandardZeitzoneBerlin(): void
    {
        $lines = $this->lines($this->generator->generate($this->tenant, []));

        self::assertContains('X-WR-TIMEZONE:Europe/Berlin', $lines);
    }

    public function testZeitzoneKommtVomVenueDerErstenReservierung(): void
    {
        $this->venue->setTimezone('Europe/Vienna');

        $lines = $this->lines($this->generator->generate($this->tenant, [$this->reservation()]));

        self::assertContains('X-WR-TIMEZONE:Europe/Vienna', $lines);
    }

    public function testKalenderNameEnthaeltTenantNameEscaped(): void
    {
        $tenant = new Tenant('Müller, Söhne; Co', 'mueller');

        $lines = $this->lines($this->generator->generate($tenant, []));

        self::assertContains('X-WR-CALNAME:Müller\\, Söhne\\; Co — Reservierungen', $lines);
    }

    public function testZeilenEndenMitCrlf(): void
    {
        $ics = $this->generator->generate($this->tenant, [$this->reservation()]);

        self::assertStringEndsWith("END:VCALENDAR\r\n", $ics);
        // Kein einzelnes \n ohne vorangehendes \r
        self::assertSame(0, preg_match("/(?<!\r)\n/", $ics));
    }

    // ── Events ──────────────────────────────────────────────────────────────

    public function testEventEnthaeltAlleGrundfelder(): void
    {
        $reservation = $this->reservation();

        $lines = $this->lines($this->generator->generate($this->tenant, [$reservation]));

        self::assertContains('BEGIN:VEVENT', $lines);
        self::assertContains('END:VEVENT', $lines);
        self::assertContains('UID:' . $reservation->getId()->toRfc4122() . '@salyseat', $lines);
        self::assertContains('DTSTART;TZID=Europe/Berlin:20261124T190000', $lines);
        self::assertContains('DTEND;TZID=Europe/Berlin:20261124T210000', $lines);
        self::assertContains('SUMMARY:Anna Schmidt (4 Pers.)', $lines);
        self::assertContains('LOCATION:Hauptraum', $lines);
        self::assertContains('SEQUENCE:0', $lines);
    }

    public function testDtstampIstUtcZeitstempel(): void
    {
        $lines = $this->lines($this->generator->generate($this->tenant, [$this->reservation()]));

        $dtstamp = $this->findLine($lines, 'DTSTAMP:');
        self::assertMatchesRegularExpression('/^DTSTAMP:\d{8}T\d{6}Z$/', $dtstamp);
    }

    public function testFuerJedeReservierungEinEvent(): void
    {
        $ics = $this->generator->generate($this->tenant, [
            $this->reservation(),
            $this->reservation(guestName: 'Ben Meier'),
            $this->reservation(guestName: 'Clara Wolf'),
        ]);

        self::assertSame(3, substr_count($ics, 'BEGIN:VEVENT'));
        self::assertSame(3, substr_count($ics, 'END:VEVENT'));
    }

    public function testPendingWirdTentative(): void
    {
        $lines = $this->lines($this->generator->generate($this->tenant, [$this->reservation()]));

        self::assertContains('STATUS:TENTATIVE', $lines);
    }

    public function testBestaetigteReservierungWirdConfirmed(): void
    {
        $reservation = $this->reservation();
        $reservation->confirm();

        $lines = $this->lines($this->generator->generate($this->tenant, [$reservation]));

        self::assertContains('STATUS:CONFIRMED', $lines);
    }

    // ── Beschreibung ────────────────────────────────────────────────────────

    public function testBeschreibungEnthaeltTischTelefonUndNotiz(): void
    {
        $reservation = $this->reservation(phone: '+49 170 1234567', notes: 'Fensterplatz');
        $reservation->setTableNumber(12);

        $lines = $this->lines($this->generator->generate($this->tenant, [$reservation]));

        self::assertContains(
            'DESCRIPTION:Tisch 12\\n4 Personen\\nTel: +49 170 1234567\\nNotiz: Fensterplatz',
            $lines,
        );
    }

    public function testBeschreibungLaesstLeereFelderWeg(): void
    {
        $lines = $this->lines($this->generator->generate($this->tenant, [$this->reservation(phone: '', notes: null)]));

        self::assertContains('DESCRIPTION:4 Personen', $lines);
    }

    public function testSonderzeichenInNotizWerdenEscaped(): void
    {
        $reservation = $this->reservation(notes: "Allergie: Nüsse, Gluten; Kinderstuhl\nGeburtstag \\o/");

        $lines = $this->lines($this->generator->generate($this->tenant, [$reservation]));

        self::assertContains(
            'DESCRIPTION:4 Personen\\nNotiz: Allergie: Nüsse\\, Gluten\\; Kinderstuhl\\nGeburtstag \\\\o/',
            $lines,
        );
    }

    // ── Zeilenfaltung (RFC 5545 §3.1) ───────────────────────────────────────

    public function testLangeZeilenWerdenAuf75OktetteGefaltet(): void
    {
        $reservation = $this->reservation(notes: str_repeat('Sehr lange Notiz zum Gast. ', 20));

        $ics = $this->generator->generate($this->tenant, [$reservation]);

        foreach (explode("\r\n", rtrim($ics, "\r\n")) as $physicalLine) {
            self::assertLessThanOrEqual(75, strlen($physicalLine), 'Zeile zu lang: ' . $physicalLine);
        }
        // Fortsetzungszeilen beginnen mit genau einem Leerzeichen
        self::assertStringContainsString("\r\n ", $ics);
    }

    public function testGefalteteZeileErgibtEntfaltetDenOriginaltext(): void
    {
        $notes       = str_repeat('Sehr lange Notiz zum Gast. ', 20);
        $reservation = $this->reservation(notes: $notes);

        $lines = $this->lines($this->generator->generate($this->tenant, [$reservation]));

        self::assertContains('DESCRIPTION:4 Personen\\nNotiz: ' . $notes, $lines);
    }

    public function testFaltungSchneidetKeineUtf8ZeichenAuseinander(): void
    {
        $reservation = $this->reservation(notes: str_repeat('Äöü🍷ß', 40));

        $ics = $this->generator->generate($this->tenant, [$reservation]);

        foreach (explode("\r\n", rtrim($ics, "\r\n")) as $physicalLine) {
            self::assertLessThanOrEqual(75, strlen($physicalLine));
            self::assertTrue(mb_check_encoding($physicalLine, 'UTF-8'), 'Ungültiges UTF-8 in: ' . bin2hex($physicalLine));
        }
    }

    public function testKurzeZeilenWerdenNichtGefaltet(): void
    {
        $ics = $this->generator->generate($this->tenant, [$this->reservation()]);

        self::assertStringNotContainsString("\r\n ", $ics);
    }

    // ── Helfer ──────────────────────────────────────────────────────────────

    private function reservation(
        string $guestName = 'Anna Schmidt',
        int $partySize = 4,
        ?string $phone = null,
        ?string $notes = null,
    ): Reservation {
        return new Reservation(
            venue:      $this->venue,
            guestName:  $guestName,
            guestEmail: 'gast@example.com',
            partySize:  $partySize,
            startsAt:   new \DateTimeImmutable('2026-11-24 19:00:00'),
            endsAt:     new \DateTimeImmutable('2026-11-24 21:00:00'),
            guestPhone: $phone,
            guestNotes: $notes,
        );
    }

    /**
     * Entfaltet den ICS-Text (CRLF + Leerzeichen entfernen) und gibt die
     * logischen Zeilen zurück.
     *
     * @return string[]
     */
    private function lines(string $ics): array
    {
        $unfolded = str_replace("\r\n ", '', $ics);

        return explode("\r\n", rtrim($unfolded, "\r\n"));
    }

    /** @param string[] $lines */
    private function findLine(array $lines, string $prefix): string
    {
        foreach ($lines as $line) {
            if (str_starts_with($line, $prefix)) {
                return $line;
            }
        }
        self::fail('Zeile mit Präfix "' . $prefix . '" nicht gefunden.');
    }
}
