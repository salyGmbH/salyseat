<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Reservation\Application\Command\JoinWaitlist\JoinWaitlistCommand;
use App\Module\Reservation\Application\Command\JoinWaitlist\JoinWaitlistHandler;
use App\Module\Reservation\Application\Dto\WaitlistEntryDto;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * Öffentliche API — wird direkt vom Widget aufgerufen.
 * Keine Authentifizierung erforderlich.
 */
#[Route('/waitlist')]
class WaitlistController extends AbstractController
{
    public function __construct(
        private readonly ValidatorInterface $validator,
        private readonly JoinWaitlistHandler $joinHandler,
    ) {}

    /**
     * POST /api/v1/widget/waitlist
     * Trägt einen Gast für einen ausgebuchten Zeitslot in die Warteliste ein.
     */
    #[Route('', name: 'widget_waitlist_join', methods: ['POST'])]
    public function join(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $constraints = new Assert\Collection([
            'venue_id'     => [new Assert\NotBlank(), new Assert\Uuid()],
            'requested_at' => [new Assert\NotBlank(), new Assert\DateTime(\DateTimeInterface::ATOM)],
            'party_size'   => [new Assert\NotBlank(), new Assert\Range(min: 1, max: 50)],
            'guest_first_name' => new Assert\Optional([new Assert\Length(max: 255)]),
            'guest_name'   => [new Assert\NotBlank(), new Assert\Length(min: 2, max: 255)],
            'guest_email'  => [new Assert\NotBlank(), new Assert\Email()],
            'guest_phone'  => new Assert\Optional([new Assert\Length(max: 20)]),
            'notes'        => new Assert\Optional([new Assert\Length(max: 1000)]),
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
            $entry = ($this->joinHandler)(new JoinWaitlistCommand(
                venueId:     $data['venue_id'],
                requestedAt: new \DateTimeImmutable($data['requested_at']),
                partySize:   (int) $data['party_size'],
                guestName:   $data['guest_name'],
                guestEmail:  $data['guest_email'],
                guestPhone:  $data['guest_phone'] ?? null,
                notes:       $data['notes'] ?? null,
                guestFirstName: ($data['guest_first_name'] ?? '') !== '' ? (string) $data['guest_first_name'] : null,
            ));
        } catch (\DomainException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(
            [
                'waitlist_entry' => WaitlistEntryDto::fromEntity($entry)->toArray(),
                'message'        => 'Du wurdest auf die Warteliste gesetzt. Wir melden uns, sobald ein Platz frei wird.',
            ],
            Response::HTTP_CREATED,
        );
    }
}
