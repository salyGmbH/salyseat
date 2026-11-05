<?php

declare(strict_types=1);

namespace App\Module\User\Infrastructure\Persistence;

use App\Module\User\Domain\Entity\User;
use App\Module\User\Domain\Repository\UserRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Common\Collections\Criteria;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * Die konkrete Umsetzung des Interface – hier darf Doctrine rein.
 */
class DoctrineUserRepository extends ServiceEntityRepository implements UserRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }

    public function findById(Uuid $id): ?User
    {
        $criteria = Criteria::create()
            ->where(Criteria::expr()->eq('id', $id))
            ->setMaxResults(1);

        return $this->matching($criteria)->first() ?: null;
    }

    public function findByEmail(string $email): ?User
    {
        $criteria = Criteria::create()
            ->where(Criteria::expr()->eq('email', $email))
            ->setMaxResults(1);

        return $this->matching($criteria)->first() ?: null;
    }

    /** @return User[] */
    public function findAllByTenant(Uuid $tenantId): array
    {
        $criteria = Criteria::create()
            ->where(Criteria::expr()->eq('tenant', $tenantId))
            ->orderBy(['createdAt' => Criteria::DESC]);

        return $this->matching($criteria)->toArray();
    }

    public function save(User $user): void
    {
        $this->getEntityManager()->persist($user);
        $this->getEntityManager()->flush();
    }

    public function remove(User $user): void
    {
        $this->getEntityManager()->remove($user);
        $this->getEntityManager()->flush();
    }
}
