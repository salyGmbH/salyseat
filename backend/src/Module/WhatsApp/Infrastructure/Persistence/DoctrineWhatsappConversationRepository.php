<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Infrastructure\Persistence;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversation;
use App\Module\WhatsApp\Domain\Entity\WhatsappConversationState;
use App\Module\WhatsApp\Domain\Repository\WhatsappConversationRepositoryInterface;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

class DoctrineWhatsappConversationRepository extends ServiceEntityRepository implements WhatsappConversationRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, WhatsappConversation::class);
    }

    public function findById(Uuid $id): ?WhatsappConversation
    {
        return $this->findOneBy(['id' => $id]);
    }

    public function findOpenByTenantAndPhone(Tenant $tenant, string $phone): ?WhatsappConversation
    {
        return $this->createQueryBuilder('c')
            ->where('IDENTITY(c.tenant) = :tenantId')
            ->andWhere('c.guestPhone = :phone')
            ->andWhere('c.state NOT IN (:terminal)')
            ->setParameter('tenantId', $tenant->getId()->toBinary())
            ->setParameter('phone', $phone)
            ->setParameter('terminal', WhatsappConversationState::TERMINAL)
            ->orderBy('c.updatedAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function save(WhatsappConversation $conversation): void
    {
        $this->getEntityManager()->persist($conversation);
        $this->getEntityManager()->flush();
    }
}