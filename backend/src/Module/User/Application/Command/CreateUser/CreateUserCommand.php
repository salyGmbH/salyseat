<?php

declare(strict_types=1);

namespace App\Module\User\Application\Command\CreateUser;

use Symfony\Component\Uid\Uuid;

/**
 * Das Command ist ein reines Datentransfer-Objekt (DTO).
 * Es trägt nur die Eingabe-Daten – keine Logik.
 * Wer einen User anlegen will, baut dieses Objekt und übergibt es dem Handler.
 */
final readonly class CreateUserCommand
{
    public function __construct(
        public string $email,
        public string $plainPassword,
        public ?Uuid  $tenantId,
        public array  $roles = ['ROLE_TENANT_ADMIN'],
    ) {}
}
