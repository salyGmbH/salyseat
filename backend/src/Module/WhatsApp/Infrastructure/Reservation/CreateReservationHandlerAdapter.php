<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Infrastructure\Reservation;

use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationCommand;
use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationHandler;
use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\WhatsApp\Domain\Gateway\ReservationCreatorInterface;

final class CreateReservationHandlerAdapter implements ReservationCreatorInterface
{
    public function __construct(
        private readonly CreateReservationHandler $handler,
    ) {}

    public function createReservation(CreateReservationCommand $command): Reservation
    {
        return ($this->handler)($command);
    }
}