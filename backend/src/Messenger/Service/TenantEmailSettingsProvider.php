<?php

declare(strict_types=1);

namespace App\Messenger\Service;

use App\Module\Tenant\Domain\Entity\Tenant;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Lädt die gespeicherten E-Mail-Design- und Content-Einstellungen eines Tenants.
 * Gibt für alle Felder sinnvolle Defaults zurück wenn nichts gespeichert ist.
 */
final class TenantEmailSettingsProvider
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function defaults(): array
    {
        return $this->buildSettings([]);
    }

    public function getForTenant(string $tenantId): array
    {
        $tenant = $this->em->getRepository(Tenant::class)->find(Uuid::fromString($tenantId));
        $ui     = $tenant?->getUiSettings() ?? [];

        return $this->buildSettings($ui);
    }

    private function buildSettings(array $ui): array
    {
        $es      = $ui['emailSettings'] ?? [];
        $design  = $es['design']  ?? [];
        $social  = $es['social']  ?? [];
        $content = $es['content'] ?? [];

        $mode = $design['mode'] ?? 'dark';

        return [
            'design' => [
                'mode'            => $mode,
                'primaryColor'    => $design['primaryColor']    ?? '#ff6b2c',
                'highlightColor'  => $design['highlightColor']  ?? '#ff6b2c',
                'backgroundColor' => $design['backgroundColor'] ?? ($mode === 'light' ? '#F5F7FA' : '#0E0E11'),
                'cardColor'       => $design['cardColor']       ?? ($mode === 'light' ? '#FFFFFF' : '#1F232C'),
                'textColor'       => $mode === 'light' ? '#111827' : '#F9FAFB',
                'mutedColor'      => $mode === 'light' ? '#6B7280' : '#9CA3AF',
                'borderRadius'    => $design['borderRadius']    ?? 16,
                'fontFamily'      => $design['fontFamily']      ?? 'Arial',
            ],
            'content' => [
                'confirmation' => array_merge(
                    ['footerText' => 'Vielen Dank für Ihre Reservierung. Wir freuen uns auf Ihren Besuch!', 'infoText' => '', 'signature' => "Mit freundlichen Grüßen,\nIhr Restaurantteam"],
                    $content['confirmation'] ?? [],
                ),
                'reminder' => array_merge(
                    ['footerText' => 'Wir freuen uns auf Ihren Besuch!', 'infoText' => '', 'signature' => "Mit freundlichen Grüßen,\nIhr Restaurantteam"],
                    $content['reminder'] ?? [],
                ),
                'cancel' => array_merge(
                    ['footerText' => 'Wir hoffen, Sie bald wieder bei uns begrüßen zu dürfen.', 'infoText' => '', 'signature' => "Mit freundlichen Grüßen,\nIhr Restaurantteam"],
                    $content['cancel'] ?? [],
                ),
                'no_show' => array_merge(
                    ['footerText' => '', 'infoText' => 'Wir freuen uns jederzeit auf eine neue Reservierung.', 'signature' => "Mit freundlichen Grüßen,\nIhr Restaurantteam"],
                    $content['no_show'] ?? [],
                ),
            ],
            'social' => [
                'instagram' => $social['instagram'] ?? '',
                'facebook'  => $social['facebook']  ?? '',
                'tiktok'    => $social['tiktok']    ?? '',
            ],
            'attachments' => $es['attachments'] ?? [],
            'logoLight' => $ui['logoLight'] ?? null,
            'logoDark'  => $ui['logoDark']  ?? null,
        ];
    }
}
