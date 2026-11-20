<?php

declare(strict_types=1);

namespace App\Api\Controller\SuperAdmin;

use App\Module\Tenant\Domain\Entity\PlanPrice;
use App\Module\Tenant\Domain\Repository\PlanPriceRepositoryInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/superadmin')]
class PricingController extends AbstractController
{
    public function __construct(
        private readonly PlanPriceRepositoryInterface $prices,
    ) {}

    #[Route('/pricing', name: 'superadmin_pricing_get', methods: ['GET'])]
    public function get(): JsonResponse
    {
        return $this->json($this->serialize());
    }

    #[Route('/pricing', name: 'superadmin_pricing_update', methods: ['PATCH'])]
    public function update(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        foreach (['tisch', 'menu', 'maitre'] as $plan) {
            if (!array_key_exists($plan, $data)) {
                continue;
            }
            $cents = (int) $data[$plan];
            if ($cents < 0) {
                return $this->json(['error' => "Ungültiger Preis für '{$plan}'."], Response::HTTP_BAD_REQUEST);
            }

            $price = $this->prices->findByPlan($plan);
            if ($price === null) {
                $price = new PlanPrice($plan, $cents);
            } else {
                $price->setPriceCents($cents);
            }
            $this->prices->save($price);
        }

        return $this->json($this->serialize());
    }

    private function serialize(): array
    {
        $result = [];
        foreach ($this->prices->findAll() as $p) {
            $result[$p->getPlan()] = $p->getPriceCents();
        }
        return $result;
    }
}