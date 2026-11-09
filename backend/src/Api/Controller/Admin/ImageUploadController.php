<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/upload')]
class ImageUploadController extends AbstractController
{
    public function __construct(
        private readonly string $uploadsDir,
    ) {}

    #[Route('/image', name: 'admin_upload_image', methods: ['POST'])]
    public function uploadImage(
        Request $request,
        #[CurrentUser] User $user,
    ): JsonResponse {
        $file = $request->files->get('image');

        if ($file === null) {
            return $this->json(['error' => 'Keine Datei übermittelt.'], 400);
        }

        // Typ prüfen
        $mimeType = $file->getMimeType() ?? '';
        $allowed  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!in_array($mimeType, $allowed, true)) {
            return $this->json(['error' => 'Nur JPEG, PNG, WebP und GIF sind erlaubt.'], 422);
        }

        // Größe prüfen (max. 5 MB)
        if ($file->getSize() > 5 * 1024 * 1024) {
            return $this->json(['error' => 'Datei darf maximal 5 MB groß sein.'], 422);
        }

        // Tenant-spezifisches Verzeichnis
        $tenantId  = (string) $user->getTenant()?->getId() ?? 'unknown';
        $targetDir = $this->uploadsDir . '/widget/' . $tenantId;

        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        // Alten Dateinamen aus Tenant-Settings lesen und löschen (optional clean-up)
        // (wird später ergänzt falls nötig)

        $extension = match ($mimeType) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
            default      => 'jpg',
        };

        $filename = sprintf('%s.%s', bin2hex(random_bytes(16)), $extension);
        $file->move($targetDir, $filename);

        $url = '/uploads/widget/' . $tenantId . '/' . $filename;

        return $this->json(['url' => $url]);
    }
}
