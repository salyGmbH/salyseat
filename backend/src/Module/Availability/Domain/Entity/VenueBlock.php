<?php

declare(strict_types=1);

namespace App\Module\Availability\Domain\Entity;

use App\Module\Availability\Infrastructure\Persistence\DoctrineVenueBlockRepository;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Raumspezifische Sperrzeit.
 * Blockiert Buchungen für einen bestimmten Raum (Venue) in einem Zeitraum.
 */
#[ORM\Entity(repositoryClass: DoctrineVenueBlockRepository::class)]
#[ORM\Table(name: 'venue_blocks')]
class VenueBlock
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Venue $venue;

    /** Erster Tag der Sperrung */
    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $dateFrom;

    /** Letzter Tag der Sperrung (gleich wie dateFrom bei eintägiger Sperrung) */
    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $dateTo;

    /** Freitext-Grund z.B. "Veranstaltung", "Renovierung" */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $reason = null;

    /**
     * Ganztägig gesperrt?
     * true  = der Raum ist an diesen Tagen nicht buchbar
     * false = nur ein Zeitfenster ist gesperrt (siehe timeFrom/timeTo)
     */
    #[ORM\Column(options: ['default' => true])]
    private bool $fullDay = true;

    /** Beginn des gesperrten Zeitfensters (nur relevant wenn fullDay = false) */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $timeFrom = null;

    /** Ende des gesperrten Zeitfensters (nur relevant wenn fullDay = false) */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $timeTo = null;

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
            throw new \InvalidArgumentException('dateFrom darf nicht nach dateTo liegen.');
        }

        $this->id        = Uuid::v7();
        $this->venue     = $venue;
        $this->dateFrom  = $dateFrom;
        $this->dateTo    = $dateTo;
        $this->reason    = $reason;
        $this->fullDay   = $fullDay;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid                      { return $this->id; }
    public function getVenue(): Venue                  { return $this->venue; }
    public function getDateFrom(): \DateTimeImmutable  { return $this->dateFrom; }
    public function getDateTo(): \DateTimeImmutable    { return $this->dateTo; }
    public function getReason(): ?string               { return $this->reason; }
    public function isFullDay(): bool                  { return $this->fullDay; }
    public function getTimeFrom(): ?string             { return $this->timeFrom; }
    public function getTimeTo(): ?string               { return $this->timeTo; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function setTimeRange(string $timeFrom, string $timeTo): void
    {
        $this->fullDay  = false;
        $this->timeFrom = $timeFrom;
        $this->timeTo   = $timeTo;
    }

    public function affectsDate(\DateTimeImmutable $date): bool
    {
        $d = \DateTimeImmutable::createFromFormat('Y-m-d', $date->format('Y-m-d'));
        return $d >= $this->dateFrom && $d <= $this->dateTo;
    }
}