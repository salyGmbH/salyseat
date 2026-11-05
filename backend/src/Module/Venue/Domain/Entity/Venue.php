<?php

declare(strict_types=1);

namespace App\Module\Venue\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'venues')]
#[ORM\HasLifecycleCallbacks]
class Venue
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 50)]
    private string $category; // restaurant | hotel | bar | cinema | spa | ...

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $address = null;

    #[ORM\Column(length: 100, options: ['default' => 'Europe/Berlin'])]
    private string $timezone = 'Europe/Berlin';

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $email = null;

    /** Wie lange dauert eine Reservierung standardmässig (in Minuten) */
    #[ORM\Column(options: ['default' => 90])]
    private int $defaultDurationMinutes = 90;

    /** Maximale Vorausbuchungszeit in Tagen */
    #[ORM\Column(options: ['default' => 60])]
    private int $maxAdvanceBookingDays = 60;

    /** Minimale Vorausbuchungszeit in Stunden */
    #[ORM\Column(options: ['default' => 2])]
    private int $minAdvanceBookingHours = 2;

    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    /** @var Collection<int, Resource> */
    #[ORM\OneToMany(mappedBy: 'venue', targetEntity: Resource::class, cascade: ['persist', 'remove'])]
    private Collection $resources;

    public function __construct(Tenant $tenant, string $name, string $category)
    {
        $this->id = Uuid::v7();
        $this->tenant = $tenant;
        $this->name = $name;
        $this->category = $category;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
        $this->resources = new ArrayCollection();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getTenant(): Tenant { return $this->tenant; }
    public function getName(): string { return $this->name; }
    public function getCategory(): string { return $this->category; }
    public function getDescription(): ?string { return $this->description; }
    public function getTimezone(): string { return $this->timezone; }
    public function isActive(): bool { return $this->active; }
    public function getResources(): Collection { return $this->resources; }
    public function getDefaultDurationMinutes(): int { return $this->defaultDurationMinutes; }
}
