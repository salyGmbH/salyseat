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
        $tenant = $user->getTenant();
        $addons = array_values($tenant?->getUiSettings()['addons'] ?? []);

        $response = $this->json([
            'id'       => $user->getId()->toRfc4122(),
            'email'    => $user->getEmail(),
            'roles'    => $user->getRoles(),
            'tenantId' => $tenant?->getId()->toRfc4122(),
            'plan'     => $tenant?->getPlan() ?? 'tisch',
            'addons'   => $addons,
        ]);
        // Plan/Add-ons können sich jederzeit von außen (Superadmin) ändern —
        // diese Antwort darf der Browser unter keinen Umständen zwischenspeichern.
        $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate');
        $response->headers->set('Pragma', 'no-cache');

        return $response;
    }
}
