<?php

declare(strict_types=1);

namespace App\Module\Auth\Application\Command\Login;

use App\Module\Auth\Application\Dto\LoginResponse;
use App\Module\User\Domain\Repository\UserRepositoryInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;

final class LoginHandler
{
    private const DEFAULT_TTL = 3600;

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

        // TTL aus Tenant-Settings lesen, Fallback auf 1 Stunde
        $ttl    = self::DEFAULT_TTL;
        $tenant = $user->getTenant();
        if ($tenant !== null) {
            $settings = $tenant->getUiSettings() ?? [];
            if (isset($settings['sessionTtlSeconds']) && is_int($settings['sessionTtlSeconds']) && $settings['sessionTtlSeconds'] > 0) {
                $ttl = $settings['sessionTtlSeconds'];
            }
        }

        $token = $this->jwtManager->createFromPayload($user, [
            'exp' => time() + $ttl,
        ]);

        return new LoginResponse(
            token:     $token,
            expiresIn: $ttl,
            email:     $user->getEmail(),
            roles:     $user->getRoles(),
            tenantId:  $tenant?->getId()->toRfc4122(),
        );
    }
}
