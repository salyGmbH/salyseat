<?php

declare(strict_types=1);

namespace App\Module\Tenant\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Common\Collections\Criteria;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * Minimal-Repository für Tenants.
 *
 * Das Tenant-Entity referenziert diese Klasse über
 * `#[ORM\Entity(repositoryClass: DoctrineTenantRepository::class)]`.
 * Ohne diese Klasse scheitert schon das Laden der Doctrine-Metadaten.
 *
 * Später können hier weitere Query-Methoden ergänzt werden.
 */
class DoctrineTenantRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Tenant::class);
    }

    public function findById(Uuid $id): ?Tenant
    {
        $criteria = Criteria::create()
            ->where(Criteria::expr()->eq('id', $id))
            ->setMaxResults(1);

        return $this->matching($criteria)->first() ?: null;
    }

    public function findBySlug(string $slug): ?Tenant
    {
        return $this->findOneBy(['slug' => $slug]);
    }

    public function save(Tenant $tenant): void
    {
        $this->getEntityManager()->persist($tenant);
        $this->getEntityManager()->flush();
    }
}