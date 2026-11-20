<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Domain\Gateway;

use App\Module\Reservation\Application\Command\CreateReservation\CreateReservationCommand;
use App\Module\Reservation\Domain\Entity\Reservation;

/**
 * Dünner Adapter vor CreateReservationHandler — existiert nur, damit
 * ConversationStateMachine in Unit-Tests isoliert (ohne echte DB) getestet
 * werden kann: CreateReservationHandler ist eine `final class` und daher
 * nicht direkt mockbar. Die reale Implementierung delegiert 1:1 an den
 * unveränderten CreateReservationHandler.
 */
interface ReservationCreatorInterface
{
    public function createReservation(CreateReservationCommand $command): Reservation;
}