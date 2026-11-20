<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Tenant\Domain\Entity\AddOn;
use App\Module\Tenant\Domain\Repository\AddOnRepositoryInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Liefert den Add-on-Katalog (vom Superadmin gepflegt) an die Tenant-Abo-Seite.
 * Read-only — Buchen/Aktivieren läuft weiterhin über TenantSettingsController.
 */
#[Route('/addons')]
class AddOnsController extends AbstractController
{
    public function __construct(
        private readonly AddOnRepositoryInterface $addons,
    ) {}

    #[Route('', name: 'admin_addons_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return $this->json(array_map(
            fn (AddOn $a) => [
                'key'              => $a->getKey(),
                'name'             => $a->getName(),
                'description'      => $a->getDescription(),
                'priceCents'       => $a->getPriceCents(),
                'minPlan'          => $a->getMinPlan(),
                'includedFromPlan' => $a->getIncludedFromPlan(),
                'icon'             => $a->getIcon(),
                'status'           => $a->getStatus(),
            ],
            $this->addons->findAll(),
        ));
    }
}