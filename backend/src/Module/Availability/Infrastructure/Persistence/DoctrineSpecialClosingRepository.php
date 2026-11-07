<?php

declare(strict_types=1);

namespace App\Module\Availability\Infrastructure\Persistence;

use App\Module\Availability\Domain\Entity\SpecialClosing;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineSpecialClosingRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SpecialClosing::class);
    }

    /** @return SpecialClosing[] */
    public function findByVenue(Venue $venue): array
    {
        return $this->createQueryBuilder('sc')
            ->where('sc.venue = :venue')
            ->setParameter('venue', $venue)
            ->orderBy('sc.dateFrom', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function findById(Uuid $id): ?SpecialClosing
    {
        return $this->findOneBy(['id' => $id]);
    }

    /**
     * Alle Sondertage die ein bestimmtes Datum betreffen.
     * @return SpecialClosing[]
     */
    public function findAffectingDate(Venue $venue, \DateTimeImmutable $date): array
    {
        return $this->createQueryBuilder('sc')
            ->where('sc.venue = :venue')
            ->andWhere('sc.dateFrom <= :date')
            ->andWhere('sc.dateTo >= :date')
            ->setParameter('venue', $venue)
            ->setParameter('date', $date->format('Y-m-d'))
            ->getQuery()
            ->getResult();
    }

    public function save(SpecialClosing $sc): void
    {
        $this->getEntityManager()->persist($sc);
        $this->getEntityManager()->flush();
    }

    public function delete(SpecialClosing $sc): void
    {
        $this->getEntityManager()->remove($sc);
        $this->getEntityManager()->flush();
    }
}
