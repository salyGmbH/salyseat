<?php

declare(strict_types=1);

namespace App\Module\Voucher\Domain\Entity;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Voucher\Infrastructure\Persistence\DoctrineVoucherConfigRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Eine Zeile pro Tenant — speichert, welche Zahlungsmethoden aktiviert sind.
 */
#[ORM\Entity(repositoryClass: DoctrineVoucherConfigRepository::class)]
#[ORM\Table(name: 'voucher_configs')]
class VoucherConfig
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\OneToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE', unique: true)]
    private Tenant $tenant;

    /**
     * Array von Zahlungsmethoden-IDs, die aktiviert sind.
     * z.B. ["card","apple_pay","google_pay"]
     *
     * @var string[]
     */
    #[ORM\Column(type: 'json')]
    private array $activePaymentMethods = ['card', 'apple_pay', 'google_pay'];

    public function __construct(Tenant $tenant)
    {
        $this->id     = Uuid::v7();
        $this->tenant = $tenant;
    }

    public function togglePaymentMethod(string $id): void
    {
        if (in_array($id, $this->activePaymentMethods, true)) {
            $this->activePaymentMethods = array_values(
                array_filter($this->activePaymentMethods, fn($m) => $m !== $id)
            );
        } else {
            $this->activePaymentMethods[] = $id;
        }
    }

    public function getId(): Uuid                         { return $this->id; }
    public function getTenant(): Tenant                   { return $this->tenant; }
    public function getActivePaymentMethods(): array      { return $this->activePaymentMethods; }
}