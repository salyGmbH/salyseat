<?php

declare(strict_types=1);

namespace App\Api\Controller\SuperAdmin;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/superadmin')]
class StatsController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    #[Route('/stats', name: 'superadmin_stats', methods: ['GET'])]
    public function stats(): JsonResponse
    {
        $totalTenants = (int) $this->em->createQuery(
            'SELECT COUNT(t.id) FROM App\Module\Tenant\Domain\Entity\Tenant t'
        )->getSingleScalarResult();

        $activeTenants = (int) $this->em->createQuery(
            'SELECT COUNT(t.id) FROM App\Module\Tenant\Domain\Entity\Tenant t WHERE t.active = true'
        )->getSingleScalarResult();

        $thirtyDaysAgo = new \DateTimeImmutable('-30 days');
        $newTenants = (int) $this->em->createQuery(
            'SELECT COUNT(t.id) FROM App\Module\Tenant\Domain\Entity\Tenant t WHERE t.createdAt >= :since'
        )->setParameter('since', $thirtyDaysAgo)->getSingleScalarResult();

        // Plan-Verteilung
        $planRows = $this->em->createQuery(
            'SELECT t.plan, COUNT(t.id) as cnt
             FROM App\Module\Tenant\Domain\Entity\Tenant t
             GROUP BY t.plan'
        )->getResult();

        $byPlan = [];
        foreach ($planRows as $row) {
            $byPlan[$row['plan']] = (int) $row['cnt'];
        }

        return $this->json([
            'totalTenants'  => $totalTenants,
            'activeTenants' => $activeTenants,
            'newLast30Days' => $newTenants,
            'byPlan'        => $byPlan,
        ]);
    }
}