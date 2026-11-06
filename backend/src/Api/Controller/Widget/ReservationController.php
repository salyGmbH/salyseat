<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Reservation\Application\Command\CancelReservation\CancelReservationCommand;
use App\Module\Reservation\Application\Command\CancelReservation\CancelReservationHandler;
use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationCommand;
use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationHandler;
use App\Module\Reservation\Application\Dto\ReservationDto;
use App\Module\Reservation\Application\Query\GetReservationByToken\GetReservationByTokenHandler;
use App\Module\Reservation\Application\Query\GetReservationByToken\GetReservationByTokenQuery;
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
        private readonly CreateReservationHandler $createHandler,
        private readonly CancelReservationHandler $cancelHandler,
        private readonly GetReservationByTokenHandler $statusHandler,
    ) {}

    /**
     * POST /api/v1/widget/reservations
     * Erstellt eine Reservierung. venue_id bestimmt welches Venue gebucht wird.
     */
    #[Route('', name: 'widget_reservation_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $constraints = new Assert\Collection([
            'venue_id'    => [new Assert\NotBlank(), new Assert\Uuid()],
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

        try {
            $reservation = ($this->createHandler)(new CreateReservationCommand(
                venueId:    $data['venue_id'],
                guestName:  $data['guest_name'],
                guestEmail: $data['guest_email'],
                partySize:  (int) $data['party_size'],
                startsAt:   new \DateTimeImmutable($data['starts_at']),
                guestPhone: $data['guest_phone'] ?? null,
                guestNotes: $data['notes'] ?? null,
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(
            [
                'reservation' => ReservationDto::fromEntity($reservation)->toArray(),
                'message'     => 'Reservierung erfolgreich erstellt. Sie erhalten eine Bestätigungsmail.',
            ],
            Response::HTTP_CREATED,
        );
    }

    /**
     * GET /api/v1/widget/reservations/{token}
     * Gibt den Status einer Reservierung zurück (für Gast-Links).
     */
    #[Route('/{token}', name: 'widget_reservation_status', methods: ['GET'])]
    public function status(string $token): JsonResponse
    {
        try {
            $dto = ($this->statusHandler)(new GetReservationByTokenQuery($token));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_NOT_FOUND);
        }

        return $this->json($dto->toArray());
    }

    /**
     * DELETE /api/v1/widget/reservations/{token}
     * Storniert eine Reservierung durch den Gast.
     */
    #[Route('/{token}', name: 'widget_reservation_cancel', methods: ['DELETE'])]
    public function cancel(string $token): JsonResponse
    {
        try {
            ($this->cancelHandler)(new CancelReservationCommand($token));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(['message' => 'Reservierung wurde erfolgreich storniert.']);
    }
}
