<?php

declare(strict_types=1);

namespace App\Api\Controller\Widget;

use App\Module\Tenant\Infrastructure\Persistence\DoctrineTenantRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/menu-download')]
class MenuDownloadController extends AbstractController
{
    public function __construct(
        private readonly DoctrineTenantRepository $tenants,
        private readonly string                   $uploadsDir,
    ) {}

    /**
     * GET /api/v1/widget/menu-download?key=...
     * Liefert die im Speisekarte-Editor zuletzt erzeugte PDF als erzwungenen
     * Download (statt sie nur im Browser anzuzeigen) — Ziel des QR-Codes auf
     * den Tischen. Kein Auth nötig, wird direkt vom Gäste-Handy aufgerufen.
     * Komplett unabhängig von den Widget-Einstellungen (eigener Pfad in
     * speisekarteKonfiguration), damit hier nichts an der bestehenden
     * Speisekarten-Anzeige im Buchungs-Widget ändert.
     */
    #[Route('', name: 'widget_menu_download', methods: ['GET'])]
    public function download(Request $request): Response
    {
        $key    = $request->query->get('key', '');
        $tenant = $this->tenants->findByPublicKey($key);

        if ($tenant === null || !$tenant->isActive()) {
            return $this->json(['error' => 'Restaurant nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $konfig = $tenant->getUiSettings()['speisekarteKonfiguration'] ?? [];
        $path   = trim((string) ($konfig['pdfPath'] ?? ''));

        if ($path === '' || !str_starts_with($path, '/uploads/attachments/')) {
            return $this->json(['error' => 'Keine Speisekarten-PDF hinterlegt.'], Response::HTTP_NOT_FOUND);
        }

        // Pfad-Traversal ausschließen: aufgelöster Pfad muss weiterhin im
        // erwarteten Tenant-Unterordner liegen.
        $tenantDir    = $this->uploadsDir . '/attachments/' . $tenant->getId();
        $relativePath = substr($path, strlen('/uploads/attachments/'));
        $absolutePath = realpath($this->uploadsDir . '/attachments/' . $relativePath);
        $tenantDirReal = realpath($tenantDir);

        if ($absolutePath === false || $tenantDirReal === false || !str_starts_with($absolutePath, $tenantDirReal)) {
            return $this->json(['error' => 'Datei nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $downloadName = trim((string) ($konfig['pdfName'] ?? '')) ?: 'Speisekarte.pdf';

        $response = new BinaryFileResponse($absolutePath);
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, $downloadName);
        $response->headers->set('Content-Type', 'application/pdf');

        return $response;
    }
}