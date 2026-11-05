<?php

declare(strict_types=1);

namespace App\Module\Auth\Application\Dto;

/**
 * Was der Client nach erfolgreichem Login erhält.
 *
 * token      — das JWT, das bei jedem weiteren Request im Header mitgeschickt wird
 * expiresIn  — Sekunden bis das Token abläuft (z.B. 3600 = 1 Stunde)
 * roles      — damit das Frontend weiss welche Seiten es anzeigen darf
 * tenantId   — für Multi-Tenancy: welchem Restaurant gehört dieser User
 */
final readonly class LoginResponse
{
    public function __construct(
        public string  $token,
        public int     $expiresIn,
        public string  $email,
        public array   $roles,
        public ?string $tenantId,
    ) {}
}