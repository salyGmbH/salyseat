<?php

declare(strict_types=1);

namespace App\Module\Staff\Infrastructure\Persistence;

use App\Module\Staff\Domain\Entity\Staff;
use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineStaffRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Staff::class);
    }

    /** @return Staff[] */
    public function findByTenant(Tenant $tenant): array
    {
        return $this->findBy(['tenant' => $tenant], ['employeeNumber' => 'ASC']);
    }

    public function findById(Uuid $id): ?Staff
    {
        return $this->findOneBy(['id' => $id]);
    }

    public function nextEmployeeNumber(Tenant $tenant): int
    {
        $max = $this->createQueryBuilder('s')
            ->select('MAX(s.employeeNumber)')
            ->where('IDENTITY(s.tenant) = :tenantId')
            ->setParameter('tenantId', $tenant->getId()->toBinary())
            ->getQuery()
            ->getSingleScalarResult();

        return ($max === null ? 0 : (int) $max) + 1;
    }
}
