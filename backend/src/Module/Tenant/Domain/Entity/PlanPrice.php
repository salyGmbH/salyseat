<?php

declare(strict_types=1);

namespace App\Module\Tenant\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * Globaler Preis eines Abo-Plans (tisch/menu/maitre) — nicht tenant-spezifisch.
 * Wird vom Superadmin gepflegt und in der Admin-Abo-Seite sowie im Superadmin
 * angezeigt.
 */
#[ORM\Entity]
#[ORM\Table(name: 'plan_prices')]
#[ORM\HasLifecycleCallbacks]
class PlanPrice
{
    #[ORM\Id]
    #[ORM\Column(length: 20)]
    private string $plan;

    #[ORM\Column]
    private int $priceCents;

    #[ORM\Column(length: 3, options: ['default' => 'EUR'])]
    private string $currency = 'EUR';

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct(string $plan, int $priceCents, string $currency = 'EUR')
    {
        $this->plan       = $plan;
        $this->priceCents = $priceCents;
        $this->currency   = $currency;
        $this->updatedAt  = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getPlan(): string
    {
        return $this->plan;
    }

    public function getPriceCents(): int
    {
        return $this->priceCents;
    }

    public function getCurrency(): string
    {
        return $this->currency;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function setPriceCents(int $priceCents): void
    {
        $this->priceCents = $priceCents;
    }
}