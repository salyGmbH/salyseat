<?php

declare(strict_types=1);

namespace App\Module\Review\Infrastructure\Persistence;

use App\Module\Review\Domain\Entity\GuestReview;
use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineGuestReviewRepository extends ServiceEntityRepository
{
    public function __construct(
        ManagerRegistry $registry,
        private readonly EntityManagerInterface $em,
        private readonly Connection $dbal,
    ) {
        parent::__construct($registry, GuestReview::class);
    }

    public function findByToken(string $token): ?GuestReview
    {
        return $this->findOneBy(['token' => $token]);
    }

    public function findByIdAndTenant(Uuid $id, Tenant $tenant): ?GuestReview
    {
        $found = $this->dbal->fetchOne(
            'SELECT BIN_TO_UUID(id) FROM guest_reviews
              WHERE id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))',
            [$id->toRfc4122(), $tenant->getId()->toRfc4122()],
        );

        if ($found === false) {
            return null;
        }

        return $this->em->find(GuestReview::class, Uuid::fromString($found));
    }

    /** @return GuestReview[] */
    public function findSubmittedByTenant(Tenant $tenant): array
    {
        $ids = $this->dbal->fetchFirstColumn(
            'SELECT BIN_TO_UUID(id) FROM guest_reviews
              WHERE tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND status = \'submitted\'
              ORDER BY submitted_at DESC',
            [$tenant->getId()->toRfc4122()],
        );

        return array_values(array_filter(
            array_map(
                fn(string $id) => $this->em->find(GuestReview::class, Uuid::fromString($id)),
                $ids,
            ),
        ));
    }

    public function countUnreadByTenant(Tenant $tenant): int
    {
        return (int) $this->dbal->fetchOne(
            'SELECT COUNT(*) FROM guest_reviews
              WHERE tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND status = \'submitted\'
                AND read_at IS NULL',
            [$tenant->getId()->toRfc4122()],
        );
    }

    public function save(GuestReview $review): void
    {
        $this->em->persist($review);
        $this->em->flush();
    }
}