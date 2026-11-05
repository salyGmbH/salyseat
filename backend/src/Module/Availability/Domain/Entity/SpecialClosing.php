<?php

declare(strict_types=1);

namespace App\Module\Availability\Domain\Entity;

use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Sonderöffnungszeiten oder Schliessungen für einen bestimmten Tag.
 * Überschreibt die regulären OpeningHours für diesen Tag.
 *
 * Beispiele:
 * - Weihnachten: komplett geschlossen
 * - Silvester: nur von 18:00 - 23:00 geöffnet
 * - Betriebsferien: 01.08 - 14.08 geschlossen
 */
#[ORM\Entity]
#[ORM\Table(name: 'special_closings')]
class SpecialClosing
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Venue $venue;

    /** Erster Tag der Schliessung */
    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $dateFrom;

    /**
     * Letzter Tag der Schliessung.
     * Gleich wie dateFrom bei eintägiger Schliessung.
     */
    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $dateTo;

    /** Freitext-Grund z.B. "Weihnachten", "Betriebsurlaub", "Renovierung" */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $reason = null;

    /**
     * Komplett geschlossen oder nur geänderte Öffnungszeiten?
     * true  = das Venue ist an diesen Tagen komplett zu
     * false = das Venue hat abweichende Öffnungszeiten (siehe openTime/closeTime)
     */
    #[ORM\Column(options: ['default' => true])]
    private bool $fullDay = true;

    /** Abweichende Öffnungszeit (nur relevant wenn fullDay = false) */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $openTime = null;

    /** Abweichende Schliesszeit (nur relevant wenn fullDay = false) */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $closeTime = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(
        Venue $venue,
        \DateTimeImmutable $dateFrom,
        \DateTimeImmutable $dateTo,
        ?string $reason = null,
        bool $fullDay = true,
    ) {
        if ($dateFrom > $dateTo) {
            throw new \InvalidArgumentException(
                'dateFrom darf nicht nach dateTo liegen.'
            );
        }

        $this->id = Uuid::v7();
        $this->venue = $venue;
        $this->dateFrom = $dateFrom;
        $this->dateTo = $dateTo;
        $this->reason = $reason;
        $this->fullDay = $fullDay;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getVenue(): Venue
    {
        return $this->venue;
    }
    public function getDateFrom(): \DateTimeImmutable
    {
        return $this->dateFrom;
    }
    public function getDateTo(): \DateTimeImmutable
    {
        return $this->dateTo;
    }
    public function getReason(): ?string
    {
        return $this->reason;
    }
    public function isFullDay(): bool
    {
        return $this->fullDay;
    }
    public function getOpenTime(): ?string
    {
        return $this->openTime;
    }
    public function getCloseTime(): ?string
    {
        return $this->closeTime;
    }
    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** Prüft ob ein bestimmtes Datum von dieser Schliessung betroffen ist */
    public function affectsDate(\DateTimeImmutable $date): bool
    {
        $dateOnly = \DateTimeImmutable::createFromFormat('Y-m-d', $date->format('Y-m-d'));

        return $dateOnly >= $this->dateFrom && $dateOnly <= $this->dateTo;
    }

    public function isClosedOnDate(\DateTimeImmutable $date): bool
    {
        return $this->affectsDate($date) && $this->fullDay;
    }

    public function setReason(?string $reason): void
    {
        $this->reason = $reason;
    }

    public function setFullDay(bool $fullDay): void
    {
        $this->fullDay = $fullDay;

        if ($fullDay) {
            $this->openTime = null;
            $this->closeTime = null;
        }
    }

    public function setCustomHours(string $openTime, string $closeTime): void
    {
        $this->fullDay = false;
        $this->openTime = $openTime;
        $this->closeTime = $closeTime;
    }

    public function setDates(\DateTimeImmutable $dateFrom, \DateTimeImmutable $dateTo): void
    {
        if ($dateFrom > $dateTo) {
            throw new \InvalidArgumentException(
                'dateFrom darf nicht nach dateTo liegen.'
            );
        }

        $this->dateFrom = $dateFrom;
        $this->dateTo = $dateTo;
    }
}
