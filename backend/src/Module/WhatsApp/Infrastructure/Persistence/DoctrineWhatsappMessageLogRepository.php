<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Infrastructure\Persistence;

use App\Module\WhatsApp\Domain\Entity\WhatsappMessageLog;
use App\Module\WhatsApp\Domain\Repository\WhatsappMessageLogRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class DoctrineWhatsappMessageLogRepository extends ServiceEntityRepository implements WhatsappMessageLogRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, WhatsappMessageLog::class);
    }

    public function existsByWaMessageId(string $waMessageId): bool
    {
        return $this->count(['waMessageId' => $waMessageId]) > 0;
    }

    public function save(WhatsappMessageLog $log): void
    {
        $this->getEntityManager()->persist($log);
        $this->getEntityManager()->flush();
    }
}
