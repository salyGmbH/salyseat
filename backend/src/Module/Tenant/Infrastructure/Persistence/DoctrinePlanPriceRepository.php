<?php

declare(strict_types=1);

namespace App\Module\Tenant\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\PlanPrice;
use App\Module\Tenant\Domain\Repository\PlanPriceRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class DoctrinePlanPriceRepository extends ServiceEntityRepository implements PlanPriceRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, PlanPrice::class);
    }

    public function findAll(): array
    {
        return $this->createQueryBuilder('p')
            ->getQuery()
            ->getResult();
    }

    public function findByPlan(string $plan): ?PlanPrice
    {
        return $this->find($plan);
    }

    public function save(PlanPrice $price): void
    {
        $this->getEntityManager()->persist($price);
        $this->getEntityManager()->flush();
    }
}
