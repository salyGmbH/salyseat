<?php

declare(strict_types=1);

namespace App\Module\Tenant\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Types\UuidType;
use Symfony\Component\Uid\Uuid;

/**
 * Speichert das Theme / Branding des Tenants.
 * Wird vom Widget geladen und als CSS-Variablen angewendet.
 */
#[ORM\Entity]
#[ORM\Table(name: 'tenant_branding')]
class TenantBranding
{
    #[ORM\Id]
    #[ORM\Column(type: UuidType::NAME, unique: true)]
    private Uuid $id;

    #[ORM\OneToOne(inversedBy: 'branding')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Tenant $tenant;

    // Farben
    #[ORM\Column(length: 7, options: ['default' => '#2563eb'])]
    private string $primaryColor = '#2563eb';

    #[ORM\Column(length: 7, options: ['default' => '#1d4ed8'])]
    private string $primaryColorHover = '#1d4ed8';

    #[ORM\Column(length: 7, options: ['default' => '#ffffff'])]
    private string $backgroundColor = '#ffffff';

    #[ORM\Column(length: 7, options: ['default' => '#111827'])]
    private string $textColor = '#111827';

    // Typografie
    #[ORM\Column(length: 100, options: ['default' => 'Inter'])]
    private string $fontFamily = 'Inter';

    #[ORM\Column(length: 4, options: ['default' => '14px'])]
    private string $baseFontSize = '14px';

    // Buttons
    #[ORM\Column(length: 20, options: ['default' => '8px'])]
    private string $borderRadius = '8px';

    #[ORM\Column(length: 10, options: ['default' => 'filled'])]
    private string $buttonStyle = 'filled'; // filled | outlined | ghost

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $logoUrl = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $widgetTitle = null;

    public function __construct(Tenant $tenant)
    {
        $this->id = Uuid::v7();
        $this->tenant = $tenant;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }
    public function getTenant(): Tenant
    {
        return $this->tenant;
    }
    public function getPrimaryColor(): string
    {
        return $this->primaryColor;
    }
    public function getBackgroundColor(): string
    {
        return $this->backgroundColor;
    }
    public function getTextColor(): string
    {
        return $this->textColor;
    }
    public function getFontFamily(): string
    {
        return $this->fontFamily;
    }
    public function getBorderRadius(): string
    {
        return $this->borderRadius;
    }
    public function getButtonStyle(): string
    {
        return $this->buttonStyle;
    }
    public function getLogoUrl(): ?string
    {
        return $this->logoUrl;
    }
    public function getWidgetTitle(): ?string
    {
        return $this->widgetTitle;
    }

    public function update(
        string $primaryColor,
        string $backgroundColor,
        string $textColor,
        string $fontFamily,
        string $borderRadius,
        string $buttonStyle,
        ?string $logoUrl,
        ?string $widgetTitle,
    ): void {
        $this->primaryColor = $primaryColor;
        $this->backgroundColor = $backgroundColor;
        $this->textColor = $textColor;
        $this->fontFamily = $fontFamily;
        $this->borderRadius = $borderRadius;
        $this->buttonStyle = $buttonStyle;
        $this->logoUrl = $logoUrl;
        $this->widgetTitle = $widgetTitle;
    }
}
