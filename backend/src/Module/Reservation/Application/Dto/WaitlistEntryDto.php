<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Dto;

use App\Module\Reservation\Domain\Entity\WaitlistEntry;

final readonly class WaitlistEntryDto
{
    private function __construct(
        public string $id,
        public string $status,
        public string $venueId,
        public string $venueName,
        public ?string $guestFirstName,
        public string $guestName,
        public string $guestEmail,
        public ?string $guestPhone,
        public ?string $notes,
        public int $partySize,
        public string $requestedAt,
        public string $createdAt,
    ) {}

    public static function fromEntity(WaitlistEntry $entry): self
    {
        return new self(
            id:          $entry->getId()->toRfc4122(),
            status:      $entry->getStatus(),
            venueId:     $entry->getVenue()->getId()->toRfc4122(),
            venueName:   $entry->getVenue()->getName(),
            guestFirstName: $entry->getGuestFirstName(),
            guestName:   $entry->getGuestName(),
            guestEmail:  $entry->getGuestEmail(),
            guestPhone:  $entry->getGuestPhone(),
            notes:       $entry->getNotes(),
            partySize:   $entry->getPartySize(),
            requestedAt: $entry->getRequestedAt()->format(\DateTimeInterface::ATOM),
            createdAt:   $entry->getCreatedAt()->format(\DateTimeInterface::ATOM),
        );
    }

    public function toArray(): array
    {
        return [
            'id'           => $this->id,
            'status'       => $this->status,
            'venue_id'     => $this->venueId,
            'venue_name'   => $this->venueName,
            'guest_first_name' => $this->guestFirstName,
            'guest_name'   => $this->guestName,
            'guest_email'  => $this->guestEmail,
            'guest_phone'  => $this->guestPhone,
            'notes'        => $this->notes,
            'party_size'   => $this->partySize,
            'requested_at' => $this->requestedAt,
            'created_at'   => $this->createdAt,
        ];
    }
}
