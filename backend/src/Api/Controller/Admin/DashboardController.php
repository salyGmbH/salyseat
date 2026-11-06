<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Dashboard\Application\Query\DashboardStatsHandler;
use App\Module\Dashboard\Application\Query\DashboardStatsQuery;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/stats')]
class DashboardController extends AbstractController
{
    public function __construct(
        private readonly DashboardStatsHandler $statsHandler,
    ) {}

    #[Route('', name: 'admin_stats', methods: ['GET'])]
    public function stats(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json([
                'today'    => ['total' => 0, 'guests' => 0, 'pending' => 0, 'confirmed' => 0, 'cancelled' => 0, 'no_show' => 0],
                'tomorrow' => ['total' => 0, 'guests' => 0, 'pending' => 0, 'confirmed' => 0, 'cancelled' => 0, 'no_show' => 0],
                'week'     => ['total' => 0, 'guests' => 0, 'pending' => 0, 'confirmed' => 0, 'cancelled' => 0, 'no_show' => 0],
                'venues'   => 0,
            ]);
        }

        return $this->json(
            ($this->statsHandler)(new DashboardStatsQuery($tenant->getId()->toRfc4122()))
        );
    }
}
