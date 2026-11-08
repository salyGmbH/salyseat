<?php

declare(strict_types=1);

namespace App\Module\Notiz\Domain\Entity;

use App\Module\Notiz\Infrastructure\Persistence\DoctrineNotizenRepository;
use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\User\Domain\Entity\User;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity(repositoryClass: DoctrineNotizenRepository::class)]
#[ORM\Table(name: 'notizen')]
#[ORM\HasLifecycleCallbacks]
class Notiz
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    /** YYYY-MM-DD */
    #[ORM\Column(length: 10)]
    private string $date;

    /** HH:MM oder null = ganzer Tag */
    #[ORM\Column(length: 5, nullable: true)]
    private ?string $time = null;

    #[ORM\Column(length: 255)]
    private string $title;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $text = null;

    #[ORM\Column(length: 20, options: ['default' => 'default'])]
    private string $color = 'default';

    #[ORM\Column(options: ['default' => false])]
    private bool $done = false;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?User $createdBy = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Tenant $tenant, string $date, string $title)
    {
        $this->id        = Uuid::v7();
        $this->tenant    = $tenant;
        $this->date      = $date;
        $this->title     = $title;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getTenant(): Tenant { return $this->tenant; }
    public function getDate(): string { return $this->date; }
    public function getTime(): ?string { return $this->time; }
    public function getTitle(): string { return $this->title; }
    public function getText(): ?string { return $this->text; }
    public function getColor(): string { return $this->color; }
    public function isDone(): bool { return $this->done; }
    public function getCreatedBy(): ?User { return $this->createdBy; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function setCreatedBy(?User $user): void { $this->createdBy = $user; }
    public function setDate(string $date): void { $this->date = $date; }
    public function setTime(?string $time): void { $this->time = $time; }
    public function setTitle(string $title): void { $this->title = $title; }
    public function setText(?string $text): void { $this->text = $text; }
    public function setColor(string $color): void { $this->color = $color; }
    public function toggleDone(): void { $this->done = !$this->done; }
}