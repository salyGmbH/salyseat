<?php

declare(strict_types=1);

namespace App\Module\Voucher\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Voucher\Domain\Entity\VoucherImage;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineVoucherImageRepository extends ServiceEntityRepository
{
    public function __construct(
        ManagerRegistry $registry,
        private readonly EntityManagerInterface $em,
        private readonly Connection $dbal,
    ) {
        parent::__construct($registry, VoucherImage::class);
    }

    /** @return VoucherImage[] */
    public function findByTenant(Tenant $tenant): array
    {
        $ids = $this->dbal->fetchFirstColumn(
            'SELECT BIN_TO_UUID(id) FROM voucher_images
              WHERE tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
              ORDER BY created_at ASC',
            [$tenant->getId()->toRfc4122()],
        );

        return array_values(array_filter(
            array_map(fn(string $id) => $this->em->find(VoucherImage::class, Uuid::fromString($id)), $ids),
        ));
    }

    public function findByIdAndTenant(Uuid $id, Tenant $tenant): ?VoucherImage
    {
        $found = $this->dbal->fetchOne(
            'SELECT BIN_TO_UUID(id) FROM voucher_images
              WHERE id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))',
            [$id->toRfc4122(), $tenant->getId()->toRfc4122()],
        );

        if ($found === false) return null;

        return $this->em->find(VoucherImage::class, Uuid::fromString($found));
    }

    public function save(VoucherImage $image): void
    {
        $this->em->persist($image);
        $this->em->flush();
    }

    public function delete(VoucherImage $image): void
    {
        $this->em->remove($image);
        $this->em->flush();
    }
}
