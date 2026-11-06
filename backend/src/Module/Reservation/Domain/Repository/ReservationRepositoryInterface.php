<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Repository;

use App\Module\Reservation\Domain\Entity\Reservation;
use Symfony\Component\Uid\Uuid;

interface ReservationRepositoryInterface
{
    public function findById(Uuid $id): ?Reservation;

    public function findByToken(string $token): ?Reservation;

    /**
     * @return Reservation[]
     */
    public function findByTenant(
        Uuid $tenantId,
        ?string $status = null,
        ?\DateTimeImmutable $date = null,
        int $limit = 50,
        int $offset = 0,
    ): array;

    public function countByTenant(
        Uuid $tenantId,
        ?string $status = null,
        ?\DateTimeImmutable $date = null,
    ): int;

    public function save(Reservation $reservation): void;
}
