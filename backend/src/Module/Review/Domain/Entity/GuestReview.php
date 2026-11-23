<?php

declare(strict_types=1);

namespace App\Module\Review\Domain\Entity;

use App\Module\Review\Infrastructure\Persistence\DoctrineGuestReviewRepository;
use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity(repositoryClass: DoctrineGuestReviewRepository::class)]
#[ORM\Table(name: 'guest_reviews')]
class GuestReview
{
    public const STATUS_PENDING   = 'pending';
    public const STATUS_SUBMITTED = 'submitted';

    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 36)]
    private string $reservationId;

    #[ORM\Column(length: 255)]
    private string $guestName;

    /** Einmaliger Token für den Bewertungslink in der E-Mail */
    #[ORM\Column(length: 64, unique: true)]
    private string $token;

    #[ORM\Column(length: 20, options: ['default' => self::STATUS_PENDING])]
    private string $status = self::STATUS_PENDING;

    #[ORM\Column(nullable: true)]
    private ?int $ratingService = null;

    #[ORM\Column(nullable: true)]
    private ?int $ratingFood = null;

    #[ORM\Column(nullable: true)]
    private ?int $ratingAmbiance = null;

    #[ORM\Column(nullable: true)]
    private ?int $ratingValue = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $comment = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $submittedAt = null;

    /** Zeitstempel wann ein Admin die Bewertung im Dashboard gesehen hat (null = ungelesen) */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $readAt = null;

    public function __construct(Tenant $tenant, string $reservationId, string $guestName, string $token)
    {
        $this->id            = Uuid::v7();
        $this->tenant        = $tenant;
        $this->reservationId = $reservationId;
        $this->guestName     = $guestName;
        $this->token         = $token;
        $this->createdAt     = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getTenant(): Tenant { return $this->tenant; }
    public function getReservationId(): string { return $this->reservationId; }
    public function getGuestName(): string { return $this->guestName; }
    public function getToken(): string { return $this->token; }
    public function getStatus(): string { return $this->status; }
    public function getRatingService(): ?int { return $this->ratingService; }
    public function getRatingFood(): ?int { return $this->ratingFood; }
    public function getRatingAmbiance(): ?int { return $this->ratingAmbiance; }
    public function getRatingValue(): ?int { return $this->ratingValue; }
    public function getComment(): ?string { return $this->comment; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getSubmittedAt(): ?\DateTimeImmutable { return $this->submittedAt; }
    public function getReadAt(): ?\DateTimeImmutable { return $this->readAt; }
    public function isSubmitted(): bool { return $this->status === self::STATUS_SUBMITTED; }
    public function isRead(): bool { return $this->readAt !== null; }

    public function submit(int $service, int $food, int $ambiance, int $value, ?string $comment): void
    {
        $this->ratingService = $service;
        $this->ratingFood    = $food;
        $this->ratingAmbiance = $ambiance;
        $this->ratingValue   = $value;
        $this->comment       = $comment;
        $this->status        = self::STATUS_SUBMITTED;
        $this->submittedAt   = new \DateTimeImmutable();
    }

    public function markRead(): void
    {
        if ($this->readAt === null) {
            $this->readAt = new \DateTimeImmutable();
        }
    }
}