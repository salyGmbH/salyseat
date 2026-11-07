<?php

declare(strict_types=1);

namespace App\Module\Availability\Infrastructure\Persistence;

use App\Module\Availability\Domain\Entity\OpeningHours;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class DoctrineOpeningHoursRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OpeningHours::class);
    }

    /** @return OpeningHours[] */
    public function findByVenue(Venue $venue): array
    {
        return $this->findBy(['venue' => $venue], ['weekday' => 'ASC']);
    }

    public function findByVenueAndWeekday(Venue $venue, int $weekday): ?OpeningHours
    {
        return $this->findOneBy(['venue' => $venue, 'weekday' => $weekday]);
    }

    public function save(OpeningHours $oh): void
    {
        $this->getEntityManager()->persist($oh);
        $this->getEntityManager()->flush();
    }

    public function saveAll(array $list): void
    {
        foreach ($list as $oh) {
            $this->getEntityManager()->persist($oh);
        }
        $this->getEntityManager()->flush();
    }
}
