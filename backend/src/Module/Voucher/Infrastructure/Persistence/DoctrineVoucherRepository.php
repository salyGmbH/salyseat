<?php

declare(strict_types=1);

namespace App\Module\Voucher\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Voucher\Domain\Entity\Voucher;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineVoucherRepository extends ServiceEntityRepository
{
    public function __construct(
        ManagerRegistry $registry,
        private readonly EntityManagerInterface $em,
        private readonly Connection $dbal,
    ) {
        parent::__construct($registry, Voucher::class);
    }

    /** @return Voucher[] */
    public function findByTenant(Tenant $tenant): array
    {
        $ids = $this->dbal->fetchFirstColumn(
            'SELECT BIN_TO_UUID(id) FROM vouchers
              WHERE tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
              ORDER BY created_at DESC',
            [$tenant->getId()->toRfc4122()],
        );

        return array_values(array_filter(
            array_map(fn(string $id) => $this->em->find(Voucher::class, Uuid::fromString($id)), $ids),
        ));
    }

    public function findByIdAndTenant(Uuid $id, Tenant $tenant): ?Voucher
    {
        $found = $this->dbal->fetchOne(
            'SELECT BIN_TO_UUID(id) FROM vouchers
              WHERE id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))',
            [$id->toRfc4122(), $tenant->getId()->toRfc4122()],
        );

        if ($found === false) return null;

        return $this->em->find(Voucher::class, Uuid::fromString($found));
    }

    public function findByCodeAndTenant(string $code, Tenant $tenant): ?Voucher
    {
        $found = $this->dbal->fetchOne(
            'SELECT BIN_TO_UUID(id) FROM vouchers
              WHERE code = ?
                AND tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))',
            [strtoupper($code), $tenant->getId()->toRfc4122()],
        );

        if ($found === false) return null;

        return $this->em->find(Voucher::class, Uuid::fromString($found));
    }

    public function codeExistsAnywhere(string $code): bool
    {
        return (bool) $this->dbal->fetchOne(
            'SELECT 1 FROM vouchers WHERE code = ?',
            [strtoupper($code)],
        );
    }

    public function save(Voucher $voucher): void
    {
        $this->em->persist($voucher);
        $this->em->flush();
    }

    public function delete(Voucher $voucher): void
    {
        $this->em->remove($voucher);
        $this->em->flush();
    }
}
