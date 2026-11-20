<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Tenant\Domain\Repository\PlanPriceRepositoryInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/pricing')]
class PricingController extends AbstractController
{
    public function __construct(
        private readonly PlanPriceRepositoryInterface $prices,
    ) {}

    #[Route('', name: 'admin_pricing_get', methods: ['GET'])]
    public function get(): JsonResponse
    {
        $result = [];
        foreach ($this->prices->findAll() as $p) {
            $result[$p->getPlan()] = $p->getPriceCents();
        }

        return $this->json($result);
    }
}