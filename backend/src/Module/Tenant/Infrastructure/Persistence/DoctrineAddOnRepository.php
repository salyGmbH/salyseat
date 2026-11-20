<?php

declare(strict_types=1);

namespace App\Module\Tenant\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\AddOn;
use App\Module\Tenant\Domain\Repository\AddOnRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineAddOnRepository extends ServiceEntityRepository implements AddOnRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AddOn::class);
    }

    public function findAll(): array
    {
        return $this->createQueryBuilder('a')
            ->orderBy('a.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function findById(Uuid $id): ?AddOn
    {
        return $this->find($id);
    }

    public function findByKey(string $key): ?AddOn
    {
        return $this->findOneBy(['key' => $key]);
    }

    public function save(AddOn $addOn): void
    {
        $this->getEntityManager()->persist($addOn);
        $this->getEntityManager()->flush();
    }

    public function remove(AddOn $addOn): void
    {
        $this->getEntityManager()->remove($addOn);
        $this->getEntityManager()->flush();
    }
}
