<?php

declare(strict_types=1);

namespace App\Module\Notiz\Infrastructure\Persistence;

use App\Module\Notiz\Domain\Entity\Notiz;
use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineNotizenRepository extends ServiceEntityRepository
{
    public function __construct(
        ManagerRegistry $registry,
        private readonly EntityManagerInterface $em,
        private readonly Connection $dbal,
    ) {
        parent::__construct($registry, Notiz::class);
    }

    /** @return Notiz[] */
    public function findByTenant(Tenant $tenant): array
    {
        $ids = $this->dbal->fetchFirstColumn(
            'SELECT BIN_TO_UUID(id) FROM notizen
              WHERE tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
              ORDER BY date ASC, IFNULL(time, \'99:99\') ASC',
            [$tenant->getId()->toRfc4122()],
        );

        return array_values(array_filter(
            array_map(
                fn(string $id) => $this->em->find(Notiz::class, Uuid::fromString($id)),
                $ids,
            ),
        ));
    }

    public function findByIdAndTenant(Uuid $id, Tenant $tenant): ?Notiz
    {
        $found = $this->dbal->fetchOne(
            'SELECT BIN_TO_UUID(id) FROM notizen
              WHERE id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))',
            [$id->toRfc4122(), $tenant->getId()->toRfc4122()],
        );

        if ($found === false) {
            return null;
        }

        return $this->em->find(Notiz::class, Uuid::fromString($found));
    }

    public function save(Notiz $notiz): void
    {
        $this->em->persist($notiz);
        $this->em->flush();
    }

    public function delete(Notiz $notiz): void
    {
        $this->em->remove($notiz);
        $this->em->flush();
    }
}