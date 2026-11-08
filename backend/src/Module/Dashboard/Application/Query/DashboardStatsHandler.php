<?php

declare(strict_types=1);

namespace App\Module\Dashboard\Application\Query;

use Doctrine\DBAL\Connection;

final class DashboardStatsHandler
{
    public function __construct(
        private readonly Connection $dbal,
    ) {}

    public function __invoke(DashboardStatsQuery $query): array
    {
        $tenantId      = $query->tenantId;
        $todayStart    = new \DateTimeImmutable('today midnight');
        $tomorrowStart = new \DateTimeImmutable('tomorrow midnight');
        $dayAfterStart = new \DateTimeImmutable('+2 days midnight');
        $weekStart     = new \DateTimeImmutable('monday this week midnight');
        $weekEnd       = (new \DateTimeImmutable('sunday this week midnight'))->modify('+1 day');

        return [
            'today'    => $this->periodStats($tenantId, $todayStart, $tomorrowStart),
            'tomorrow' => $this->periodStats($tenantId, $tomorrowStart, $dayAfterStart),
            'week'     => $this->periodStats($tenantId, $weekStart, $weekEnd),
            'venues'   => $this->countVenues($tenantId),
        ];
    }

    private function periodStats(string $tenantId, \DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $rows = $this->dbal->fetchAllAssociative(
            'SELECT r.status,
                    COUNT(r.id)                     AS cnt,
                    COALESCE(SUM(r.party_size), 0)  AS guests
               FROM reservations r
               JOIN venues v ON v.id = r.venue_id
              WHERE v.tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND r.starts_at >= ?
                AND r.starts_at <  ?
              GROUP BY r.status',
            [
                $tenantId,
                $from->format('Y-m-d H:i:s'),
                $to->format('Y-m-d H:i:s'),
            ],
        );

        $byStatus = [];
        foreach ($rows as $row) {
            $byStatus[$row['status']] = [
                'count'  => (int) $row['cnt'],
                'guests' => (int) $row['guests'],
            ];
        }

        // Gesamtzahl = alle sinnvollen Buchungen (ohne Stornierungen / No-Shows)
        $countStatuses = ['pending', 'confirmed', 'seated', 'cleanup', 'completed'];
        $total  = 0;
        $guests = 0;
        foreach ($countStatuses as $s) {
            $total  += $byStatus[$s]['count']  ?? 0;
            $guests += $byStatus[$s]['guests'] ?? 0;
        }

        $seatedCount  = ($byStatus['seated']['count']  ?? 0) + ($byStatus['cleanup']['count']  ?? 0);
        $seatedGuests = ($byStatus['seated']['guests'] ?? 0) + ($byStatus['cleanup']['guests'] ?? 0);

        return [
            'total'         => $total,
            'guests'        => $guests,
            'pending'       => $byStatus['pending']['count']   ?? 0,
            'confirmed'     => $byStatus['confirmed']['count'] ?? 0,
            'seated'        => $seatedCount,
            'seated_guests' => $seatedGuests,
            'completed'     => $byStatus['completed']['count'] ?? 0,
            'cancelled'     => $byStatus['cancelled']['count'] ?? 0,
            'no_show'       => $byStatus['no_show']['count']   ?? 0,
        ];
    }

    private function countVenues(string $tenantId): int
    {
        return (int) $this->dbal->fetchOne(
            'SELECT COUNT(v.id)
               FROM venues v
              WHERE v.tenant_id = UNHEX(REPLACE(?, \'-\', \'\'))
                AND v.active = 1',
            [$tenantId],
        );
    }
}
