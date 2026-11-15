<?php

declare(strict_types=1);

namespace App\Module\Voucher\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\Voucher\Domain\Entity\VoucherConfig;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;

class DoctrineVoucherConfigRepository extends ServiceEntityRepository
{
    public function __construct(
        ManagerRegistry $registry,
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct($registry, VoucherConfig::class);
    }

    public function findOrCreateByTenant(Tenant $tenant): VoucherConfig
    {
        $config = $this->findOneBy(['tenant' => $tenant]);

        if ($config === null) {
            $config = new VoucherConfig($tenant);
            $this->em->persist($config);
            $this->em->flush();
        }

        return $config;
    }

    public function save(VoucherConfig $config): void
    {
        $this->em->persist($config);
        $this->em->flush();
    }
}