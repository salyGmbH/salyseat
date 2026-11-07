<?php

declare(strict_types=1);

namespace App\Module\Reservation\Infrastructure\Persistence;

use App\Module\Reservation\Domain\Entity\Guest;
use App\Module\Reservation\Domain\Repository\GuestRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineGuestRepository extends ServiceEntityRepository implements GuestRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Guest::class);
    }

    public function findById(Uuid $id): ?Guest
    {
        return $this->findOneBy(['id' => $id]);
    }

    public function findByTenantAndEmail(Uuid $tenantId, string $email): ?Guest
    {
        return $this->createQueryBuilder('g')
            ->where('IDENTITY(g.tenant) = :tenantId')
            ->andWhere('g.email = :email')
            ->setParameter('tenantId', $tenantId->toBinary())
            ->setParameter('email', strtolower(trim($email)))
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function listByTenant(Uuid $tenantId, ?string $search, int $limit, int $offset): array
    {
        $qb = $this->createQueryBuilder('g')
            ->where('IDENTITY(g.tenant) = :tenantId')
            ->setParameter('tenantId', $tenantId->toBinary())
            ->orderBy('g.name', 'ASC')
            ->setMaxResults($limit)
            ->setFirstResult($offset);

        if ($search !== null && $search !== '') {
            $qb->andWhere('g.name LIKE :search OR g.email LIKE :search')
               ->setParameter('search', '%' . $search . '%');
        }

        return $qb->getQuery()->getResult();
    }

    public function countByTenant(Uuid $tenantId, ?string $search): int
    {
        $qb = $this->createQueryBuilder('g')
            ->select('COUNT(g.id)')
            ->where('IDENTITY(g.tenant) = :tenantId')
            ->setParameter('tenantId', $tenantId->toBinary());

        if ($search !== null && $search !== '') {
            $qb->andWhere('g.name LIKE :search OR g.email LIKE :search')
               ->setParameter('search', '%' . $search . '%');
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    public function save(Guest $guest): void
    {
        $this->getEntityManager()->persist($guest);
        $this->getEntityManager()->flush();
    }
}
