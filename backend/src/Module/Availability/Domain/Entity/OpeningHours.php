<?php

declare(strict_types=1);

namespace App\Module\Availability\Domain\Entity;

use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Öffnungszeiten eines Venues pro Wochentag.
 * Pro Venue + Wochentag gibt es genau einen Eintrag.
 *
 * Wochentage: 0 = Montag, 1 = Dienstag, ..., 6 = Sonntag
 */
#[ORM\Entity]
#[ORM\Table(name: 'opening_hours')]
#[ORM\UniqueConstraint(name: 'uq_venue_weekday', columns: ['venue_id', 'weekday'])]
class OpeningHours
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Venue $venue;

    /**
     * 0 = Montag, 1 = Dienstag, 2 = Mittwoch,
     * 3 = Donnerstag, 4 = Freitag, 5 = Samstag, 6 = Sonntag
     */
    #[ORM\Column(type: 'smallint')]
    private int $weekday;

    /** Ob der Wochentag überhaupt geöffnet ist */
    #[ORM\Column(options: ['default' => true])]
    private bool $open = true;

    /** Öffnungszeit als String z.B. "08:00" */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $openTime = null;

    /** Schliesszeit als String z.B. "22:00" */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $closeTime = null;

    /**
     * Optionale Pausenzeiten (z.B. Ruhezeit 14:00 - 17:00).
     * Wird als JSON gespeichert: [{"from": "14:00", "to": "17:00"}]
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $breaks = null;

    public function __construct(Venue $venue, int $weekday)
    {
        if ($weekday < 0 || $weekday > 6) {
            throw new \InvalidArgumentException(
                sprintf('Weekday muss zwischen 0 (Montag) und 6 (Sonntag) liegen, "%d" gegeben.', $weekday)
            );
        }

        $this->id = Uuid::v7();
        $this->venue = $venue;
        $this->weekday = $weekday;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getVenue(): Venue
    {
        return $this->venue;
    }
    public function getWeekday(): int
    {
        return $this->weekday;
    }
    public function isOpen(): bool
    {
        return $this->open;
    }
    public function getOpenTime(): ?string
    {
        return $this->openTime;
    }
    public function getCloseTime(): ?string
    {
        return $this->closeTime;
    }
    public function getBreaks(): ?array
    {
        return $this->breaks;
    }

    public function getWeekdayLabel(): string
    {
        return match ($this->weekday) {
            0 => 'Montag',
            1 => 'Dienstag',
            2 => 'Mittwoch',
            3 => 'Donnerstag',
            4 => 'Freitag',
            5 => 'Samstag',
            6 => 'Sonntag',
        };
    }

    public function setOpen(bool $open): void
    {
        $this->open = $open;

        if (!$open) {
            $this->openTime = null;
            $this->closeTime = null;
            $this->breaks = null;
        }
    }

    public function setHours(string $openTime, string $closeTime): void
    {
        $this->validateTimeFormat($openTime);
        $this->validateTimeFormat($closeTime);

        if ($openTime >= $closeTime) {
            throw new \InvalidArgumentException(
                sprintf('Öffnungszeit "%s" muss vor Schliesszeit "%s" liegen.', $openTime, $closeTime)
            );
        }

        $this->open = true;
        $this->openTime = $openTime;
        $this->closeTime = $closeTime;
    }

    public function setBreaks(?array $breaks): void
    {
        $this->breaks = $breaks;
    }


    /**
     * Prüft ob ein bestimmter Zeitpunkt (HH:MM) in die Öffnungszeiten fällt.
     * Berücksichtigt auch Pausen.
     */
    public function isTimeWithinOpeningHours(string $time): bool
    {
        if (!$this->open || $this->openTime === null || $this->closeTime === null) {
            return false;
        }

        if ($time < $this->openTime || $time >= $this->closeTime) {
            return false;
        }

        if ($this->breaks !== null) {
            foreach ($this->breaks as $break) {
                if ($time >= $break['from'] && $time < $break['to']) {
                    return false;
                }
            }
        }

        return true;
    }

    private function validateTimeFormat(string $time): void
    {
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
            throw new \InvalidArgumentException(
                sprintf('Ungültiges Zeitformat "%s". Erwartet wird HH:MM z.B. "08:00".', $time)
            );
        }
    }
}
