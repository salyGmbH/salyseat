<?php

declare(strict_types=1);

namespace App\Api\Security;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

/**
 * Authentifiziert Widget-Anfragen anhand des X-Public-Key Headers.
 * Jeder Tenant hat einen einzigartigen publicKey der im Widget eingebettet ist.
 */
class PublicKeyAuthenticator extends AbstractAuthenticator
{
    public function supports(Request $request): ?bool
    {
        return $request->headers->has('X-Public-Key')
            || $request->query->has('key');
    }

    public function authenticate(Request $request): Passport
    {
        $publicKey = $request->headers->get('X-Public-Key')
            ?? $request->query->get('key');

        if (!$publicKey) {
            throw new AuthenticationException('Kein Public Key angegeben.');
        }

        // UserBadge lädt den User anhand des publicKey
        // Der User-Provider muss findByPublicKey unterstützen
        return new SelfValidatingPassport(
            new UserBadge('pk_' . $publicKey, function (string $identifier) use ($publicKey) {
                // TODO: TenantRepository::findByPublicKey($publicKey) aufrufen
                // und einen anonymen Widget-User zurückgeben
                return null;
            })
        );
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return null; // Request normal weiterleiten
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        return new JsonResponse([
            'error' => 'Ungültiger Public Key.',
        ], Response::HTTP_UNAUTHORIZED);
    }
}
