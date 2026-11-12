<?php

declare(strict_types=1);

namespace App\Module\Availability\Infrastructure\Persistence;

use App\Module\Availability\Domain\Entity\VenueBlock;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

class DoctrineVenueBlockRepository
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    /** @return VenueBlock[] */
    public function findByVenue(Venue $venue): array
    {
        return $this->em->getRepository(VenueBlock::class)->findBy(
            ['venue' => $venue],
            ['dateFrom' => 'ASC'],
        );
    }

    public function findById(Uuid $id): ?VenueBlock
    {
        return $this->em->getRepository(VenueBlock::class)->find($id);
    }

    public function save(VenueBlock $block): void
    {
        $this->em->persist($block);
        $this->em->flush();
    }

    public function delete(VenueBlock $block): void
    {
        $this->em->remove($block);
        $this->em->flush();
    }
}