<?php

declare(strict_types=1);

namespace App\Api\Controller\Admin;

use App\Module\Notiz\Domain\Entity\Notiz;
use App\Module\Notiz\Infrastructure\Persistence\DoctrineNotizenRepository;
use App\Module\Staff\Infrastructure\Persistence\DoctrineStaffRepository;
use App\Module\User\Domain\Entity\User;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

#[Route('/notizen')]
class NotizenController extends AbstractController
{
    public function __construct(
        private readonly DoctrineNotizenRepository $repo,
        private readonly DoctrineStaffRepository   $staffRepo,
    ) {}

    #[Route('', name: 'admin_notizen_list', methods: ['GET'])]
    public function list(#[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        // Staff-Records des Tenants einmalig laden und nach E-Mail indexieren
        $staffByEmail = [];
        foreach ($this->staffRepo->findByTenant($tenant) as $staff) {
            if ($staff->getEmail() !== null) {
                $staffByEmail[strtolower($staff->getEmail())] = $staff;
            }
        }

        return $this->json(array_map(
            fn(Notiz $n) => $this->serialize($n, $staffByEmail),
            $this->repo->findByTenant($tenant),
        ));
    }

    #[Route('', name: 'admin_notizen_create', methods: ['POST'])]
    public function create(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        $date  = trim((string) ($data['date']  ?? ''));
        $title = trim((string) ($data['title'] ?? ''));

        if ($date === '' || $title === '') {
            return $this->json(['error' => 'date und title sind Pflichtfelder.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $notiz = new Notiz($tenant, $date, $title);
        $notiz->setTime(($data['time'] ?? null) !== null && trim((string) $data['time']) !== '' ? trim((string) $data['time']) : null);
        $notiz->setText(($data['text'] ?? '') !== '' ? trim((string) $data['text']) : null);
        $notiz->setColor(in_array($data['color'] ?? '', ['default', 'info', 'success', 'warn'], true) ? $data['color'] : 'default');
        $notiz->setCreatedBy($user);

        $this->repo->save($notiz);

        // Staff-Lookup für den erstellenden User
        $staffByEmail = [];
        foreach ($this->staffRepo->findByTenant($tenant) as $staff) {
            if ($staff->getEmail() !== null) {
                $staffByEmail[strtolower($staff->getEmail())] = $staff;
            }
        }

        return $this->json($this->serialize($notiz, $staffByEmail), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'admin_notizen_update', methods: ['PATCH'])]
    public function update(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $notiz = $this->repo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($notiz === null) {
            return $this->json(['error' => 'Notiz nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (isset($data['date']))  $notiz->setDate(trim((string) $data['date']));
        if (array_key_exists('time', $data)) $notiz->setTime($data['time'] !== null && trim((string) $data['time']) !== '' ? trim((string) $data['time']) : null);
        if (isset($data['title'])) $notiz->setTitle(trim((string) $data['title']));
        if (array_key_exists('text', $data)) $notiz->setText($data['text'] !== '' ? trim((string) $data['text']) : null);
        if (isset($data['color']) && in_array($data['color'], ['default', 'info', 'success', 'warn'], true)) {
            $notiz->setColor($data['color']);
        }

        $this->repo->save($notiz);

        $staffByEmail = [];
        foreach ($this->staffRepo->findByTenant($tenant) as $staff) {
            if ($staff->getEmail() !== null) {
                $staffByEmail[strtolower($staff->getEmail())] = $staff;
            }
        }

        return $this->json($this->serialize($notiz, $staffByEmail));
    }

    #[Route('/{id}/toggle-done', name: 'admin_notizen_toggle_done', methods: ['PATCH'])]
    public function toggleDone(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $notiz = $this->repo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($notiz === null) {
            return $this->json(['error' => 'Notiz nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $notiz->toggleDone();
        $this->repo->save($notiz);

        $staffByEmail = [];
        foreach ($this->staffRepo->findByTenant($tenant) as $staff) {
            if ($staff->getEmail() !== null) {
                $staffByEmail[strtolower($staff->getEmail())] = $staff;
            }
        }

        return $this->json($this->serialize($notiz, $staffByEmail));
    }

    #[Route('/{id}', name: 'admin_notizen_delete', methods: ['DELETE'])]
    public function delete(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $tenant = $user->getTenant();
        if ($tenant === null) {
            return $this->json(['error' => 'Kein Tenant'], Response::HTTP_FORBIDDEN);
        }

        $notiz = $this->repo->findByIdAndTenant(Uuid::fromString($id), $tenant);
        if ($notiz === null) {
            return $this->json(['error' => 'Notiz nicht gefunden.'], Response::HTTP_NOT_FOUND);
        }

        $this->repo->delete($notiz);

        return $this->json(['ok' => true]);
    }

    private function serialize(Notiz $n, array $staffByEmail = []): array
    {
        $createdBy = null;
        $creator   = $n->getCreatedBy();
        if ($creator !== null) {
            $email     = strtolower($creator->getEmail());
            $staff     = $staffByEmail[$email] ?? null;
            $createdBy = [
                'name'           => $staff?->getName() ?? ($creator->getEmail()),
                'employeeNumber' => $staff?->getEmployeeNumber(),
            ];
        }

        return [
            'id'        => $n->getId()->toRfc4122(),
            'date'      => $n->getDate(),
            'time'      => $n->getTime(),
            'title'     => $n->getTitle(),
            'text'      => $n->getText() ?? '',
            'color'     => $n->getColor(),
            'done'      => $n->isDone(),
            'createdBy' => $createdBy,
            'createdAt' => $n->getCreatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
