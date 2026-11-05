<?php

declare(strict_types=1);

namespace App\Api\Controller\Auth;

use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * GET /api/v1/auth/me
 *
 * Gibt Infos über den aktuell eingeloggten User zurück.
 * JWT-geschützt — funktioniert nur mit gültigem Bearer Token im Authorization-Header.
 *
 * Nützlich für das Angular-Frontend beim Start: "Wer bin ich, welche Rechte habe ich?"
 */
class MeController extends AbstractController
{
    #[Route('/me', name: 'auth_me', methods: ['GET'])]
    public function me(#[CurrentUser] User $user): JsonResponse
    {
        return $this->json([
            'id'       => $user->getId()->toRfc4122(),
            'email'    => $user->getEmail(),
            'roles'    => $user->getRoles(),
            'tenantId' => $user->getTenant()?->getId()->toRfc4122(),
        ]);
    }
}
