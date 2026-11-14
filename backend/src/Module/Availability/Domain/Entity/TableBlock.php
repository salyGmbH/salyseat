<?php

declare(strict_types=1);

namespace App\Module\Availability\Domain\Entity;

use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'table_blocks')]
class TableBlock
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Venue $venue;

    /** Tischnummer (entspricht PlacedTable.id im Frontend) */
    #[ORM\Column(type: 'integer')]
    private int $tableNumber;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $dateFrom;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $dateTo;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $reason = null;

    #[ORM\Column(options: ['default' => true])]
    private bool $fullDay = true;

    #[ORM\Column(length: 5, nullable: true)]
    private ?string $timeFrom = null;

    #[ORM\Column(length: 5, nullable: true)]
    private ?string $timeTo = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct(
        Venue $venue,
        int $tableNumber,
        \DateTimeImmutable $dateFrom,
        \DateTimeImmutable $dateTo,
        ?string $reason = null,
        bool $fullDay = true,
    ) {
        if ($dateFrom > $dateTo) {
            throw new \InvalidArgumentException('dateFrom darf nicht nach dateTo liegen.');
        }

        $this->id          = Uuid::v7();
        $this->venue       = $venue;
        $this->tableNumber = $tableNumber;
        $this->dateFrom    = $dateFrom;
        $this->dateTo      = $dateTo;
        $this->reason      = $reason;
        $this->fullDay     = $fullDay;
        $this->createdAt   = new \DateTimeImmutable();
    }

    public function getId(): Uuid                      { return $this->id; }
    public function getVenue(): Venue                  { return $this->venue; }
    public function getTableNumber(): int              { return $this->tableNumber; }
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

    /** Prüft ob dieser Block einen bestimmten Zeitpunkt betrifft. */
    public function isActiveAt(\DateTimeImmutable $dateTime): bool
    {
        $date = $dateTime->format('Y-m-d');
        if ($date < $this->dateFrom->format('Y-m-d') || $date > $this->dateTo->format('Y-m-d')) {
            return false;
        }
        if ($this->fullDay) {
            return true;
        }
        $hhmm    = $dateTime->format('H:i');
        $from    = $this->timeFrom ?? '00:00';
        $to      = $this->timeTo   ?? '23:59';
        return $hhmm >= $from && $hhmm < $to;
    }
}