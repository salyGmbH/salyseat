<?php

declare(strict_types=1);

namespace App\Module\Reservation\Application\Dto;

use App\Module\Reservation\Domain\Entity\Reservation;

final readonly class ReservationDto
{
    private function __construct(
        public string $id,
        public string $token,
        public string $status,
        public string $venueId,
        public string $venueName,
        public string $guestName,
        public string $guestEmail,
        public ?string $guestPhone,
        public ?string $guestNotes,
        public int $partySize,
        public string $startsAt,
        public string $endsAt,
        public ?string $adminNotes,
        public string $createdAt,
        public array $guestGasttypen,
        public array $guestHinweise,
        public ?string $guestId,
        public ?string $guestInternalNotes,
        public bool $guestBlocked,
        public ?string $guestBlockedReason,
    ) {}

    public static function fromEntity(Reservation $r): self
    {
        return new self(
            id:               $r->getId()->toRfc4122(),
            token:            $r->getToken(),
            status:           $r->getStatus(),
            venueId:          $r->getVenue()->getId()->toRfc4122(),
            venueName:        $r->getVenue()->getName(),
            guestName:        $r->getGuestName(),
            guestEmail:       $r->getGuestEmail(),
            guestPhone:       $r->getGuestPhone(),
            guestNotes:       $r->getGuestNotes(),
            partySize:        $r->getPartySize(),
            startsAt:         $r->getStartsAt()->format(\DateTimeInterface::ATOM),
            endsAt:           $r->getEndsAt()->format(\DateTimeInterface::ATOM),
            adminNotes:       $r->getAdminNotes(),
            createdAt:        $r->getCreatedAt()->format(\DateTimeInterface::ATOM),
            guestGasttypen:       $r->getGuest()?->getGasttypen() ?? [],
            guestHinweise:        $r->getGuest()?->getHinweise() ?? [],
            guestId:              $r->getGuest()?->getId()->toRfc4122(),
            guestInternalNotes:   $r->getGuest()?->getInternalNotes(),
            guestBlocked:         $r->getGuest()?->isBlocked() ?? false,
            guestBlockedReason:   $r->getGuest()?->getBlockedReason(),
        );
    }

    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'token'       => $this->token,
            'status'      => $this->status,
            'venue_id'    => $this->venueId,
            'venue_name'  => $this->venueName,
            'guest_name'  => $this->guestName,
            'guest_email' => $this->guestEmail,
            'guest_phone' => $this->guestPhone,
            'guest_notes' => $this->guestNotes,
            'party_size'  => $this->partySize,
            'starts_at'   => $this->startsAt,
            'ends_at'     => $this->endsAt,
            'admin_notes'       => $this->adminNotes,
            'created_at'        => $this->createdAt,
            'guest_gasttypen'       => $this->guestGasttypen,
            'guest_hinweise'        => $this->guestHinweise,
            'guest_id'              => $this->guestId,
            'guest_internal_notes'  => $this->guestInternalNotes,
            'guest_blocked'         => $this->guestBlocked,
            'guest_blocked_reason'  => $this->guestBlockedReason,
        ];
    }
}
