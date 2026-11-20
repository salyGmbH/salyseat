<?php

declare(strict_types=1);

namespace App\Module\Tenant\Domain\Repository;

use App\Module\Tenant\Domain\Entity\PlanPrice;

interface PlanPriceRepositoryInterface
{
    /** @return PlanPrice[] */
    public function findAll(): array;

    public function findByPlan(string $plan): ?PlanPrice;

    public function save(PlanPrice $price): void;
}