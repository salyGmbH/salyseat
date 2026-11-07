<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Reservation\Application\Query\ListGuests\ListGuestsHandler;
use App\Module\Reservation\Application\Query\ListGuests\ListGuestsQuery;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/guests')]
class GuestController extends AbstractController
{
    public function __construct(
        private readonly ListGuestsHandler $listHandler,
    ) {}

    /**
     * GET /api/v1/admin/guests
     * ?search=müller  ?limit=100  ?offset=0
     */
    #[Route('', name: 'admin_guest_list', methods: ['GET'])]
    public function list(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['guests' => [], 'total' => 0, 'limit' => 100, 'offset' => 0]);
        }

        $search = $request->query->get('search');
        $limit  = max(1, min(500, (int) $request->query->get('limit', 100)));
        $offset = max(0, (int) $request->query->get('offset', 0));

        return $this->json(
            ($this->listHandler)(new ListGuestsQuery(
                tenantId: $tenant->getId()->toRfc4122(),
                search:   $search !== '' ? $search : null,
                limit:    $limit,
                offset:   $offset,
            ))
        );
    }
}