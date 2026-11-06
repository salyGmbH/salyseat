<?php

declare(strict_types=1);

namespace App\Module\Dashboard\Application\Query;

use App\Module\Reservation\Domain\Entity\Reservation;
use App\Module\Venue\Domain\Entity\Venue;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

final class DashboardStatsHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(DashboardStatsQuery $query): array
    {
        $tenantId     = Uuid::fromString($query->tenantId);
        $todayStart   = new \DateTimeImmutable('today midnight');
        $tomorrowStart = new \DateTimeImmutable('tomorrow midnight');
        $dayAfterStart = new \DateTimeImmutable('+2 days midnight');
        $weekStart    = new \DateTimeImmutable('monday this week midnight');
        $weekEnd      = (new \DateTimeImmutable('sunday this week midnight'))->modify('+1 day');

        return [
            'today'    => $this->periodStats($tenantId, $todayStart, $tomorrowStart),
            'tomorrow' => $this->periodStats($tenantId, $tomorrowStart, $dayAfterStart),
            'week'     => $this->periodStats($tenantId, $weekStart, $weekEnd),
            'venues'   => $this->countVenues($tenantId),
        ];
    }

    private function periodStats(Uuid $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $rows = $this->em->createQueryBuilder()
            ->select('r.status, COUNT(r.id) as cnt, COALESCE(SUM(r.partySize), 0) as guests')
            ->from(Reservation::class, 'r')
            ->join('r.venue', 'v')
            ->join('v.tenant', 't')
            ->where('t.id = :tenantId')
            ->andWhere('r.startsAt >= :from AND r.startsAt < :to')
            ->groupBy('r.status')
            ->setParameter('tenantId', $tenantId, 'uuid')
            ->setParameter('from', $from)
            ->setParameter('to', $to)
            ->getQuery()
            ->getResult();

        $byStatus = [];
        foreach ($rows as $row) {
            $byStatus[$row['status']] = [
                'count'  => (int) $row['cnt'],
                'guests' => (int) $row['guests'],
            ];
        }

        $active = ['pending', 'confirmed'];
        $total  = 0;
        $guests = 0;
        foreach ($active as $s) {
            $total  += $byStatus[$s]['count']  ?? 0;
            $guests += $byStatus[$s]['guests'] ?? 0;
        }

        return [
            'total'     => $total,
            'guests'    => $guests,
            'pending'   => $byStatus['pending']['count']   ?? 0,
            'confirmed' => $byStatus['confirmed']['count'] ?? 0,
            'cancelled' => $byStatus['cancelled']['count'] ?? 0,
            'no_show'   => $byStatus['no_show']['count']   ?? 0,
        ];
    }

    private function countVenues(Uuid $tenantId): int
    {
        return (int) $this->em->createQueryBuilder()
            ->select('COUNT(v.id)')
            ->from(Venue::class, 'v')
            ->join('v.tenant', 't')
            ->where('t.id = :tenantId')
            ->andWhere('v.active = true')
            ->setParameter('tenantId', $tenantId, 'uuid')
            ->getQuery()
            ->getSingleScalarResult();
    }
}
