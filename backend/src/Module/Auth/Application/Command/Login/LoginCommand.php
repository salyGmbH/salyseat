<?php

declare(strict_types=1);

namespace App\Module\Auth\Application\Command\Login;

/**
 * Trägt die Login-Eingaben vom HTTP-Request zum Handler.
 */
final readonly class LoginCommand
{
    public function __construct(
        public string $email,
        public string $plainPassword,
    ) {}
}