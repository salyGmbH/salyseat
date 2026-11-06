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

    /** Restaurantplan: Tisch-Positionen, Wände etc. als JSON */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $layout = null;

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

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getTenant(): Tenant
    {
        return $this->tenant;
    }
    public function getName(): string
    {
        return $this->name;
    }
    public function getCategory(): string
    {
        return $this->category;
    }
    public function getDescription(): ?string
    {
        return $this->description;
    }
    public function getTimezone(): string
    {
        return $this->timezone;
    }
    public function isActive(): bool
    {
        return $this->active;
    }
    public function getResources(): Collection
    {
        return $this->resources;
    }
    public function getDefaultDurationMinutes(): int
    {
        return $this->defaultDurationMinutes;
    }

    public function getMaxAdvanceBookingDays(): int
    {
        return $this->maxAdvanceBookingDays;
    }

    public function getMinAdvanceBookingHours(): int
    {
        return $this->minAdvanceBookingHours;
    }

    public function getAddress(): ?string
    {
        return $this->address;
    }

    public function getPhone(): ?string
    {
        return $this->phone;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
    }

    public function setCategory(string $category): void
    {
        $this->category = $category;
    }

    public function setDescription(?string $description): void
    {
        $this->description = $description;
    }

    public function setAddress(?string $address): void
    {
        $this->address = $address;
    }

    public function setPhone(?string $phone): void
    {
        $this->phone = $phone;
    }

    public function setEmail(?string $email): void
    {
        $this->email = $email;
    }

    public function setTimezone(string $timezone): void
    {
        $this->timezone = $timezone;
    }

    public function getLayout(): ?array
    {
        return $this->layout;
    }

    public function setLayout(?array $layout): void
    {
        $this->layout = $layout;
    }

    public function activate(): void
    {
        $this->active = true;
    }

    public function deactivate(): void
    {
        $this->active = false;
    }

    /**
     * Alle Buchungsregeln auf einmal aktualisieren.
     * Zusammengefasst weil diese Werte fachlich zusammengehören.
     */
    public function updateBookingSettings(
        int $defaultDurationMinutes,
        int $maxAdvanceBookingDays,
        int $minAdvanceBookingHours,
    ): void {
        $this->defaultDurationMinutes = $defaultDurationMinutes;
        $this->maxAdvanceBookingDays  = $maxAdvanceBookingDays;
        $this->minAdvanceBookingHours = $minAdvanceBookingHours;
    }
}
