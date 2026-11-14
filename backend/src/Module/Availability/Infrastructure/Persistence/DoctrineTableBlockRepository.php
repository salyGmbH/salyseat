<?php

declare(strict_types=1);

namespace App\Module\Availability\Infrastructure\Persistence;

use App\Module\Availability\Domain\Entity\TableBlock;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

class DoctrineTableBlockRepository
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    /** @return TableBlock[] */
    public function findByVenue(Venue $venue): array
    {
        return $this->em->getRepository(TableBlock::class)->findBy(
            ['venue' => $venue],
            ['dateFrom' => 'ASC'],
        );
    }

    /** @return TableBlock[] */
    public function findByVenueAndTable(Venue $venue, int $tableNumber): array
    {
        return $this->em->getRepository(TableBlock::class)->findBy([
            'venue'       => $venue,
            'tableNumber' => $tableNumber,
        ]);
    }

    public function findById(Uuid $id): ?TableBlock
    {
        return $this->em->getRepository(TableBlock::class)->find($id);
    }

    public function save(TableBlock $block): void
    {
        $this->em->persist($block);
        $this->em->flush();
    }

    public function delete(TableBlock $block): void
    {
        $this->em->remove($block);
        $this->em->flush();
    }
}