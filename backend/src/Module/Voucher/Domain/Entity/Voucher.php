<?php

declare(strict_types=1);

namespace App\Module\Voucher\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity(repositoryClass: DoctrineVoucherRepository::class)]
#[ORM\Table(name: 'vouchers')]
#[ORM\HasLifecycleCallbacks]
class Voucher
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    #[ORM\Column(length: 20)]
    private string $code;

    /** In Euro (z.B. 50.00 = 50 €) */
    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    private string $amount;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    private string $remainingAmount;

    #[ORM\Column(length: 255)]
    private string $buyerName;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $buyerEmail = null;

    #[ORM\Column(length: 255)]
    private string $recipientName;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $recipientEmail = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $message = null;

    /** active | redeemed | expired */
    #[ORM\Column(length: 20, options: ['default' => 'active'])]
    private string $status = 'active';

    /** email | post | post_shipped */
    #[ORM\Column(length: 20, options: ['default' => 'email'])]
    private string $deliveryMethod = 'email';

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $postalAddress = null;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $expiresAt;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $redeemedAt = null;

    public function __construct(
        Tenant $tenant,
        string $code,
        float  $amount,
        string $buyerName,
        string $recipientName,
        \DateTimeImmutable $expiresAt,
    ) {
        $this->id              = Uuid::v7();
        $this->tenant          = $tenant;
        $this->code            = strtoupper($code);
        $this->amount          = (string) $amount;
        $this->remainingAmount = (string) $amount;
        $this->buyerName       = $buyerName;
        $this->recipientName   = $recipientName;
        $this->expiresAt       = $expiresAt;
        $this->createdAt       = new \DateTimeImmutable();
    }

    public function redeem(): void
    {
        $this->status          = 'redeemed';
        $this->remainingAmount = '0.00';
        $this->redeemedAt      = new \DateTimeImmutable();
    }

    public function getId(): Uuid                       { return $this->id; }
    public function getTenant(): Tenant                 { return $this->tenant; }
    public function getCode(): string                   { return $this->code; }
    public function getAmount(): float                  { return (float) $this->amount; }
    public function getRemainingAmount(): float         { return (float) $this->remainingAmount; }
    public function getBuyerName(): string              { return $this->buyerName; }
    public function getBuyerEmail(): ?string            { return $this->buyerEmail; }
    public function getRecipientName(): string          { return $this->recipientName; }
    public function getRecipientEmail(): ?string        { return $this->recipientEmail; }
    public function getMessage(): ?string               { return $this->message; }
    public function getStatus(): string                 { return $this->status; }
    public function getExpiresAt(): \DateTimeImmutable  { return $this->expiresAt; }
    public function getCreatedAt(): \DateTimeImmutable  { return $this->createdAt; }
    public function getRedeemedAt(): ?\DateTimeImmutable { return $this->redeemedAt; }

    public function getDeliveryMethod(): string          { return $this->deliveryMethod; }
    public function getPostalAddress(): ?array           { return $this->postalAddress; }

    public function setBuyerEmail(?string $v): void            { $this->buyerEmail = $v; }
    public function setRecipientEmail(?string $v): void        { $this->recipientEmail = $v; }
    public function setMessage(?string $v): void               { $this->message = $v; }
    public function setDeliveryMethod(string $v): void         { $this->deliveryMethod = $v; }
    public function setPostalAddress(?array $v): void          { $this->postalAddress = $v; }
}
