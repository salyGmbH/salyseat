<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Dashboard\Application\Query\StatisticsHandler;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/stats/overview')]
class StatisticsController extends AbstractController
{
    public function __construct(
        private readonly StatisticsHandler $handler,
    ) {}

    #[Route('', name: 'admin_stats_overview', methods: ['GET'])]
    public function overview(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json([
                'totals'    => ['reservations' => 0, 'guests' => 0, 'noShows' => 0],
                'timeslots' => [],
                'monthly'   => [],
            ]);
        }

        $from = $request->query->has('from')
            ? new \DateTimeImmutable($request->query->getString('from'))
            : null;

        $to = $request->query->has('to')
            ? (new \DateTimeImmutable($request->query->getString('to')))->modify('+1 day midnight')
            : null;

        return $this->json(
            ($this->handler)($tenant->getId()->toRfc4122(), $from, $to)
        );
    }
}
