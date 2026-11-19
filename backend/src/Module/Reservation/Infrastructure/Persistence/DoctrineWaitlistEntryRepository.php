<?php

declare(strict_types=1);

namespace App\Module\Reservation\Infrastructure\Persistence;

use App\Module\Reservation\Domain\Entity\WaitlistEntry;
use App\Module\Reservation\Domain\Entity\WaitlistStatus;
use App\Module\Reservation\Domain\Repository\WaitlistEntryRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineWaitlistEntryRepository extends ServiceEntityRepository implements WaitlistEntryRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, WaitlistEntry::class);
    }

    public function findById(Uuid $id): ?WaitlistEntry
    {
        return $this->findOneBy(['id' => $id]);
    }

    public function sumPartySizeForSlot(Uuid $venueId, \DateTimeImmutable $requestedAt): int
    {
        $result = $this->createQueryBuilder('w')
            ->select('SUM(w.partySize)')
            ->where('IDENTITY(w.venue) = :venueId')
            ->andWhere('w.requestedAt = :requestedAt')
            ->andWhere('w.status = :status')
            ->setParameter('venueId', $venueId->toBinary())
            ->setParameter('requestedAt', $requestedAt)
            ->setParameter('status', WaitlistStatus::WAITING)
            ->getQuery()
            ->getSingleScalarResult();

        return (int) $result;
    }

    public function listByTenant(Uuid $tenantId, ?string $status, int $limit, int $offset, ?Uuid $venueId = null): array
    {
        $qb = $this->createQueryBuilder('w')
            ->where('IDENTITY(w.tenant) = :tenantId')
            ->setParameter('tenantId', $tenantId->toBinary())
            ->orderBy('w.requestedAt', 'ASC')
            ->setMaxResults($limit)
            ->setFirstResult($offset);

        if ($status !== null && $status !== '') {
            $qb->andWhere('w.status = :status')
               ->setParameter('status', $status);
        }

        if ($venueId !== null) {
            $qb->andWhere('IDENTITY(w.venue) = :venueId')
               ->setParameter('venueId', $venueId->toBinary());
        }

        return $qb->getQuery()->getResult();
    }

    public function countByTenant(Uuid $tenantId, ?string $status, ?Uuid $venueId = null): int
    {
        $qb = $this->createQueryBuilder('w')
            ->select('COUNT(w.id)')
            ->where('IDENTITY(w.tenant) = :tenantId')
            ->setParameter('tenantId', $tenantId->toBinary());

        if ($status !== null && $status !== '') {
            $qb->andWhere('w.status = :status')
               ->setParameter('status', $status);
        }

        if ($venueId !== null) {
            $qb->andWhere('IDENTITY(w.venue) = :venueId')
               ->setParameter('venueId', $venueId->toBinary());
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    public function save(WaitlistEntry $entry): void
    {
        $this->getEntityManager()->persist($entry);
        $this->getEntityManager()->flush();
    }
}