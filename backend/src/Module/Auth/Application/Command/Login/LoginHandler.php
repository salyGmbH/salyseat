<?php

declare(strict_types=1);

namespace App\Module\Auth\Application\Command\Login;

use App\Module\Auth\Application\Dto\LoginResponse;
use App\Module\User\Domain\Repository\UserRepositoryInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;

/**
 * Führt den Login-Use-Case aus:
 *
 * 1. User anhand der E-Mail suchen
 * 2. Passwort gegen den gespeicherten Hash prüfen
 * 3. JWT-Token erstellen und zurückgeben
 *
 * Warum eine eigene Exception statt "User nicht gefunden" + "Passwort falsch" separat?
 * Sicherheit: Angreifer dürfen nicht wissen ob eine E-Mail existiert oder das Passwort falsch ist.
 * Deshalb immer dieselbe Fehlermeldung: "Ungültige Zugangsdaten".
 */
final class LoginHandler
{
    public function __construct(
        private readonly UserRepositoryInterface     $users,
        private readonly UserPasswordHasherInterface $hasher,
        private readonly JWTTokenManagerInterface    $jwtManager,
    ) {}

    public function __invoke(LoginCommand $command): LoginResponse
    {
        $user = $this->users->findByEmail($command->email);

        if ($user === null || !$this->hasher->isPasswordValid($user, $command->plainPassword)) {
            throw new BadCredentialsException('Ungültige Zugangsdaten.');
        }

        $token = $this->jwtManager->create($user);

        return new LoginResponse(
            token:    $token,
            expiresIn: 3600,
            email:    $user->getEmail(),
            roles:    $user->getRoles(),
            tenantId: $user->getTenant()?->getId()->toRfc4122(),
        );
    }
}