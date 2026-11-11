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
class AttachmentUploadController extends AbstractController
{
    public function __construct(
        private readonly string $uploadsDir,
    ) {}

    #[Route('/attachment', name: 'admin_upload_attachment', methods: ['POST'])]
    public function uploadAttachment(
        Request $request,
        #[CurrentUser] User $user,
    ): JsonResponse {
        $file = $request->files->get('file');

        if ($file === null) {
            return $this->json(['error' => 'Keine Datei übermittelt.'], 400);
        }

        if ($file->getSize() > 10 * 1024 * 1024) {
            return $this->json(['error' => 'Datei darf maximal 10 MB groß sein.'], 422);
        }

        $tenantId  = (string) $user->getTenant()?->getId() ?? 'unknown';
        $targetDir = $this->uploadsDir . '/attachments/' . $tenantId;

        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        $originalName = $file->getClientOriginalName();
        $ext          = $file->getClientOriginalExtension() ?: 'bin';
        $filename     = sprintf('%s.%s', bin2hex(random_bytes(16)), $ext);
        $file->move($targetDir, $filename);

        return $this->json([
            'url'  => '/uploads/attachments/' . $tenantId . '/' . $filename,
            'name' => $originalName,
        ]);
    }
}