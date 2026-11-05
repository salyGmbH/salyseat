<?php

declare(strict_types=1);

namespace App\Module\Tenant\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * Datenbankzugriff für Tenants (Betriebe, die Salyseat nutzen).
 *
 * @extends ServiceEntityRepository<Tenant>
 */
class DoctrineTenantRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Tenant::class);
    }

    /**
     * Aktiven Tenant anhand des Public Keys aus dem Widget finden
     * (wird vom PublicKeyAuthenticator gebraucht).
     */
    public function findActiveByPublicKey(string $publicKey): ?Tenant
    {
        return $this->findOneBy(['publicKey' => $publicKey, 'active' => true]);
    }

    public function findBySlug(string $slug): ?Tenant
    {
        return $this->findOneBy(['slug' => $slug]);
    }

    public function save(Tenant $tenant, bool $flush = true): void
    {
        $this->getEntityManager()->persist($tenant);

        if ($flush) {
            $this->getEntityManager()->flush();
        }
    }

    public function remove(Tenant $tenant, bool $flush = true): void
    {
        $this->getEntityManager()->remove($tenant);

        if ($flush) {
            $this->getEntityManager()->flush();
        }
    }
}
