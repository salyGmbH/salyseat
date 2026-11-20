<?php

declare(strict_types=1);

namespace App\Module\WhatsApp\Application;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\WhatsApp\Domain\Gateway\WhatsAppGatewayInterface;
use App\Module\WhatsApp\Infrastructure\ThreeSixtyDialog\ThreeSixtyDialogClient;
use Psr\Log\LoggerInterface;

final class WhatsAppConnectorFactory
{
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly string $defaultBaseUrl,
    ) {}

    public function forTenant(Tenant $tenant): ?WhatsAppGatewayInterface
    {
        $config = $tenant->getWhatsappConfig();

        $apiKey = $config['api_key'] ?? '';
        if ($apiKey === '') {
            return null;
        }

        return new ThreeSixtyDialogClient(
            apiKey:  $apiKey,
            baseUrl: $config['base_url'] ?? $this->defaultBaseUrl,
            enabled: true,
            logger:  $this->logger,
        );
    }
}