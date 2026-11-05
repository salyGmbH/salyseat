<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/reservations')]
class ReservationController extends AbstractController
{
    public function __construct(
        private readonly ValidatorInterface $validator,
    ) {}

    /**
     * Erstellt eine neue Reservierung (vom Widget aufgerufen).
     * POST /api/v1/widget/reservations
     */
    #[Route('', name: 'widget_reservation_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        // Validierung
        $constraints = new Assert\Collection([
            'guest_name'  => [new Assert\NotBlank(), new Assert\Length(min: 2, max: 255)],
            'guest_email' => [new Assert\NotBlank(), new Assert\Email()],
            'guest_phone' => new Assert\Optional([new Assert\Length(max: 20)]),
            'party_size'  => [new Assert\NotBlank(), new Assert\Range(min: 1, max: 50)],
            'starts_at'   => [new Assert\NotBlank(), new Assert\DateTime(\DateTimeInterface::ATOM)],
            'notes'       => new Assert\Optional([new Assert\Length(max: 1000)]),
        ]);

        $violations = $this->validator->validate($data ?? [], $constraints);

        if (count($violations) > 0) {
            $errors = [];
            foreach ($violations as $violation) {
                $errors[$violation->getPropertyPath()] = $violation->getMessage();
            }
            return $this->json(['errors' => $errors], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // TODO: CreateReservationCommand via MessageBus dispatchen
        // Vorerst Dummy-Response
        return $this->json([
            'reservation' => [
                'token'      => bin2hex(random_bytes(16)),
                'status'     => 'pending',
                'starts_at'  => $data['starts_at'],
                'party_size' => $data['party_size'],
                'guest_name' => $data['guest_name'],
            ],
            'message' => 'Reservierung erfolgreich erstellt. Sie erhalten eine Bestätigungsmail.',
        ], Response::HTTP_CREATED);
    }

    /**
     * Status einer Reservierung abfragen (für Gast-Links).
     * GET /api/v1/widget/reservations/{token}
     */
    #[Route('/{token}', name: 'widget_reservation_status', methods: ['GET'])]
    public function status(string $token): JsonResponse
    {
        // TODO: ReservationRepository::findByToken() aufrufen
        return $this->json(['token' => $token, 'status' => 'confirmed']);
    }

    /**
     * Reservierung stornieren (durch den Gast).
     * DELETE /api/v1/widget/reservations/{token}
     */
    #[Route('/{token}', name: 'widget_reservation_cancel', methods: ['DELETE'])]
    public function cancel(string $token): JsonResponse
    {
        // TODO: CancelReservationCommand dispatchen
        return $this->json(['message' => 'Reservierung wurde storniert.']);
    }
}
