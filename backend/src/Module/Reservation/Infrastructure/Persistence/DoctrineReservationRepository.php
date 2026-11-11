<?php

declare(strict_types=1);

namespace App\Module\Reservation\Infrastructure\Persistence;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Reservation\Domain\Repository\ReservationRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineReservationRepository extends ServiceEntityRepository implements ReservationRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Reservation::class);
    }

    public function findById(Uuid $id): ?Reservation
    {
        return $this->findOneBy(['id' => $id]);
    }

    public function findByToken(string $token): ?Reservation
    {
        return $this->findOneBy(['token' => $token]);
    }

    /**
     * @return Reservation[]
     */
    public function findByTenant(
        Uuid $tenantId,
        ?string $status = null,
        ?\DateTimeImmutable $date = null,
        int $limit = 50,
        int $offset = 0,
        ?\DateTimeImmutable $dateFrom = null,
        ?\DateTimeImmutable $dateTo = null,
    ): array {
        $qb = $this->createQueryBuilder('r')
            ->join('r.venue', 'v')
            ->join('v.tenant', 't')
            ->where('t.id = :tenantId')
            ->setParameter('tenantId', $tenantId, 'uuid')
            ->orderBy('r.startsAt', 'ASC')
            ->setMaxResults($limit)
            ->setFirstResult($offset);

        if ($status !== null) {
            $qb->andWhere('r.status = :status')->setParameter('status', $status);
        }

        if ($date !== null) {
            $qb->andWhere('r.startsAt >= :df AND r.startsAt < :dt')
                ->setParameter('df', $date->setTime(0, 0, 0))
                ->setParameter('dt', $date->setTime(0, 0, 0)->modify('+1 day'));
        } elseif ($dateFrom !== null || $dateTo !== null) {
            if ($dateFrom !== null) {
                $qb->andWhere('r.startsAt >= :df')->setParameter('df', $dateFrom->setTime(0, 0, 0));
            }
            if ($dateTo !== null) {
                $qb->andWhere('r.startsAt < :dt')->setParameter('dt', $dateTo->setTime(0, 0, 0)->modify('+1 day'));
            }
        }

        return $qb->getQuery()->getResult();
    }

    public function countByTenant(
        Uuid $tenantId,
        ?string $status = null,
        ?\DateTimeImmutable $date = null,
        ?\DateTimeImmutable $dateFrom = null,
        ?\DateTimeImmutable $dateTo = null,
    ): int {
        $qb = $this->createQueryBuilder('r')
            ->select('COUNT(r.id)')
            ->join('r.venue', 'v')
            ->join('v.tenant', 't')
            ->where('t.id = :tenantId')
            ->setParameter('tenantId', $tenantId, 'uuid');

        if ($status !== null) {
            $qb->andWhere('r.status = :status')->setParameter('status', $status);
        }

        if ($date !== null) {
            $qb->andWhere('r.startsAt >= :df AND r.startsAt < :dt')
                ->setParameter('df', $date->setTime(0, 0, 0))
                ->setParameter('dt', $date->setTime(0, 0, 0)->modify('+1 day'));
        } elseif ($dateFrom !== null || $dateTo !== null) {
            if ($dateFrom !== null) {
                $qb->andWhere('r.startsAt >= :df')->setParameter('df', $dateFrom->setTime(0, 0, 0));
            }
            if ($dateTo !== null) {
                $qb->andWhere('r.startsAt < :dt')->setParameter('dt', $dateTo->setTime(0, 0, 0)->modify('+1 day'));
            }
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    public function save(Reservation $reservation): void
    {
        $this->getEntityManager()->persist($reservation);
        $this->getEntityManager()->flush();
    }
}
