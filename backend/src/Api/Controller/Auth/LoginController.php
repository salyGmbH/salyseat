<?php

declare(strict_types=1);

namespace App\Api\Controller\Auth;

use App\Module\Auth\Application\Command\Login\LoginCommand;
use App\Module\Auth\Application\Command\Login\LoginHandler;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Core\Exception\BadCredentialsException;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * POST /api/v1/auth/login
 *
 * Öffentlicher Endpunkt — kein JWT nötig (steht in security.yaml als PUBLIC_ACCESS).
 * Gibt bei Erfolg ein JWT zurück, das für alle anderen /api/v1/admin/* Endpunkte gilt.
 */
class LoginController extends AbstractController
{
    public function __construct(
        private readonly LoginHandler      $handler,
        private readonly ValidatorInterface $validator,
    ) {}

    #[Route('/login', name: 'auth_login', methods: ['POST'])]
    public function login(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        // Eingabe validieren bevor wir den Handler aufrufen
        $violations = $this->validator->validate($data, new Assert\Collection([
            'email'    => [new Assert\NotBlank(), new Assert\Email()],
            'password' => [new Assert\NotBlank(), new Assert\Length(min: 4)],
        ]));

        if (count($violations) > 0) {
            $errors = [];
            foreach ($violations as $v) {
                $errors[] = $v->getPropertyPath() . ': ' . $v->getMessage();
            }
            return $this->json(['errors' => $errors], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $response = ($this->handler)(new LoginCommand(
                email:         $data['email'],
                plainPassword: $data['password'],
            ));
        } catch (BadCredentialsException) {
            // Bewusst vage — kein Hinweis ob E-Mail oder Passwort falsch ist
            return $this->json(
                ['error' => 'Ungültige Zugangsdaten.'],
                Response::HTTP_UNAUTHORIZED
            );
        }

        return $this->json([
            'token'     => $response->token,
            'expiresIn' => $response->expiresIn,
            'user' => [
                'email'    => $response->email,
                'roles'    => $response->roles,
                'tenantId' => $response->tenantId,
            ],
        ]);
    }
}
