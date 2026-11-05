<?php

declare(strict_types=1);

namespace App\Module\Venue\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Eine buchbare Einheit innerhalb eines Venues.
 * Beispiele: Tisch 1, Zimmer 4, Kinosaal A, Massageliege 2
 */
#[ORM\Entity]
#[ORM\Table(name: 'resources')]
class Resource
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(inversedBy: 'resources')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Venue $venue;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column]
    private int $capacity;

    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    public function __construct(Venue $venue, string $name, int $capacity)
    {
        $this->id = Uuid::v7();
        $this->venue = $venue;
        $this->name = $name;
        $this->capacity = $capacity;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getVenue(): Venue
    {
        return $this->venue;
    }
    public function getName(): string
    {
        return $this->name;
    }
    public function getCapacity(): int
    {
        return $this->capacity;
    }
    public function isActive(): bool
    {
        return $this->active;
    }
}
