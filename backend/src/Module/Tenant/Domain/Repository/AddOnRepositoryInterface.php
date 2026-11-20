<?php

declare(strict_types=1);

namespace App\Module\Tenant\Domain\Repository;

use App\Module\Tenant\Domain\Entity\AddOn;
use Symfony\Component\Uid\Uuid;

interface AddOnRepositoryInterface
{
    /** @return AddOn[] sortiert nach sortOrder */
    public function findAll(): array;

    public function findById(Uuid $id): ?AddOn;

    public function findByKey(string $key): ?AddOn;

    public function save(AddOn $addOn): void;

    public function remove(AddOn $addOn): void;
}