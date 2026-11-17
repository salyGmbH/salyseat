<?php

declare(strict_types=1);

namespace App\Module\Pms\Application;

use App\Module\Pms\Domain\Gateway\PmsConnectorInterface;
use App\Module\Pms\Infrastructure\Mews\MewsConnector;
use App\Module\Tenant\Domain\Entity\Tenant;
use Psr\Log\LoggerInterface;

final class PmsConnectorFactory
{
    public function __construct(
        private readonly LoggerInterface $logger,
    ) {}

    public function forTenant(Tenant $tenant): ?PmsConnectorInterface
    {
        $config = $tenant->getPmsConfig();

        if (empty($config) || ($config['provider'] ?? '') !== 'mews') {
            return null;
        }

        $clientToken = $config['clientToken'] ?? '';
        $accessToken = $config['accessToken'] ?? '';

        if ($clientToken === '' || $accessToken === '') {
            return null;
        }

        return new MewsConnector(
            clientToken:        $clientToken,
            accessToken:        $accessToken,
            serviceId:          $config['serviceId'] ?? '',
            resourceCategoryId: $config['resourceCategoryId'] ?? '',
            rateId:             $config['rateId'] ?? '',
            ageCategoryId:      $config['ageCategoryId'] ?? '',
            baseUrl:            $config['baseUrl'] ?? 'https://api.mews.com',
            enabled:            true,
            logger:             $this->logger,
        );
    }
}