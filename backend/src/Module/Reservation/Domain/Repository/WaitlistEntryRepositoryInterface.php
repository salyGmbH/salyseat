<?php

declare(strict_types=1);

namespace App\Module\Reservation\Domain\Repository;

use App\Module\Reservation\Domain\Entity\WaitlistEntry;
use Symfony\Component\Uid\Uuid;

interface WaitlistEntryRepositoryInterface
{
    public function findById(Uuid $id): ?WaitlistEntry;

    /** Summe der Personenzahl aller wartenden Einträge für einen konkreten Zeitslot (für die Kapazitätsprüfung) */
    public function sumPartySizeForSlot(Uuid $venueId, \DateTimeImmutable $requestedAt): int;

    /** @return WaitlistEntry[] */
    public function listByTenant(Uuid $tenantId, ?string $status, int $limit, int $offset, ?Uuid $venueId = null): array;

    public function countByTenant(Uuid $tenantId, ?string $status, ?Uuid $venueId = null): int;

    public function save(WaitlistEntry $entry): void;
}
