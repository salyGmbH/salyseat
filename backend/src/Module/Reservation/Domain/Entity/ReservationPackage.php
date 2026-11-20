<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Eine Package-Auswahl innerhalb einer Reservierung — z.B. "2× Bday Feier".
 * Name/Preis werden zum Buchungszeitpunkt aus tenant.uiSettings.packages
 * denormalisiert (Snapshot), damit spätere Änderungen/Löschung des Packages
 * die Historie nicht verfälschen. Reine Kalkulationsinfo, keine Zahlung.
 */
#[ORM\Entity]
#[ORM\Table(name: 'reservation_packages')]
class ReservationPackage
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: Reservation::class, inversedBy: 'packages')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Reservation $reservation;

    #[ORM\Column(length: 64)]
    private string $packageId;

    #[ORM\Column(length: 255)]
    private string $packageName;

    #[ORM\Column(nullable: true)]
    private ?int $pricePerPerson = null;

    #[ORM\Column]
    private int $quantity;

    public function __construct(
        Reservation $reservation,
        string $packageId,
        string $packageName,
        ?int $pricePerPerson,
        int $quantity,
    ) {
        $this->id             = Uuid::v7();
        $this->reservation    = $reservation;
        $this->packageId      = $packageId;
        $this->packageName    = $packageName;
        $this->pricePerPerson = $pricePerPerson;
        $this->quantity       = $quantity;
    }

    public function getId(): Uuid                { return $this->id;             }
    public function getPackageId(): string        { return $this->packageId;      }
    public function getPackageName(): string      { return $this->packageName;    }
    public function getPricePerPerson(): ?int     { return $this->pricePerPerson; }
    public function getQuantity(): int            { return $this->quantity;       }
}