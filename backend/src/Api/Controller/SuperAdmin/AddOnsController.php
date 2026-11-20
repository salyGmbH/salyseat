<?php

declare(strict_types=1);

namespace App\Api\Controller\SuperAdmin;

use App\Module\Tenant\Domain\Entity\AddOn;
use App\Module\Tenant\Domain\Repository\AddOnRepositoryInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

#[Route('/superadmin/addons')]
class AddOnsController extends AbstractController
{
    public function __construct(
        private readonly AddOnRepositoryInterface $addons,
    ) {}

    #[Route('', name: 'superadmin_addons_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return $this->json(array_map(
            fn (AddOn $a) => $this->serialize($a),
            $this->addons->findAll(),
        ));
    }

    #[Route('', name: 'superadmin_addons_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        $key  = trim((string) ($data['key'] ?? ''));
        $name = trim((string) ($data['name'] ?? ''));

        if ($key === '' || $name === '') {
            return $this->json(['error' => 'Key und Name sind Pflichtfelder.'], Response::HTTP_BAD_REQUEST);
        }
        if (!preg_match('/^[a-z0-9_-]+$/', $key)) {
            return $this->json(['error' => 'Key darf nur Kleinbuchstaben, Ziffern, "-" und "_" enthalten.'], Response::HTTP_BAD_REQUEST);
        }
        if ($this->addons->findByKey($key) !== null) {
            return $this->json(['error' => "Ein Add-on mit dem Key '{$key}' existiert bereits."], Response::HTTP_CONFLICT);
        }

        $addOn = new AddOn($key, $name);
        $addOn->update(...$this->extractFields($data, $name));

        $this->addons->save($addOn);

        return $this->json($this->serialize($addOn), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'superadmin_addons_update', methods: ['PATCH'])]
    public function update(string $id, Request $request): JsonResponse
    {
        $addOn = $this->addons->findById(Uuid::fromString($id));
        if ($addOn === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string) ($data['name'] ?? $addOn->getName()));
        if ($name === '') {
            return $this->json(['error' => 'Name darf nicht leer sein.'], Response::HTTP_BAD_REQUEST);
        }

        $addOn->update(...$this->extractFields($data, $name, $addOn));

        $this->addons->save($addOn);

        return $this->json($this->serialize($addOn));
    }

    #[Route('/{id}', name: 'superadmin_addons_delete', methods: ['DELETE'])]
    public function delete(string $id): JsonResponse
    {
        $addOn = $this->addons->findById(Uuid::fromString($id));
        if ($addOn === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $this->addons->remove($addOn);

        return $this->json(['deleted' => true]);
    }

    /** @return array{0: string, 1: ?string, 2: ?int, 3: ?string, 4: ?string, 5: string, 6: string, 7: int} */
    private function extractFields(array $data, string $name, ?AddOn $existing = null): array
    {
        $validPlans = ['tisch', 'menu', 'maitre'];

        $minPlan = array_key_exists('minPlan', $data) ? $data['minPlan'] : $existing?->getMinPlan();
        if ($minPlan !== null && !in_array($minPlan, $validPlans, true)) {
            $minPlan = null;
        }

        $includedFrom = array_key_exists('includedFromPlan', $data) ? $data['includedFromPlan'] : $existing?->getIncludedFromPlan();
        if ($includedFrom !== null && !in_array($includedFrom, $validPlans, true)) {
            $includedFrom = null;
        }

        $status = $data['status'] ?? $existing?->getStatus() ?? 'active';
        if (!in_array($status, ['active', 'soon'], true)) {
            $status = 'active';
        }

        $priceRaw  = array_key_exists('priceCents', $data) ? $data['priceCents'] : $existing?->getPriceCents();
        $priceCents = $priceRaw === null || $priceRaw === '' ? null : (int) $priceRaw;

        return [
            $name,
            array_key_exists('description', $data) ? ($data['description'] ?: null) : $existing?->getDescription(),
            $priceCents,
            $minPlan,
            $includedFrom,
            trim((string) ($data['icon'] ?? $existing?->getIcon() ?? 'extension')) ?: 'extension',
            $status,
            (int) ($data['sortOrder'] ?? $existing?->getSortOrder() ?? 0),
        ];
    }

    private function serialize(AddOn $a): array
    {
        return [
            'id'                => $a->getId()->toRfc4122(),
            'key'               => $a->getKey(),
            'name'              => $a->getName(),
            'description'       => $a->getDescription(),
            'priceCents'        => $a->getPriceCents(),
            'minPlan'           => $a->getMinPlan(),
            'includedFromPlan'  => $a->getIncludedFromPlan(),
            'icon'              => $a->getIcon(),
            'status'            => $a->getStatus(),
            'sortOrder'         => $a->getSortOrder(),
            'createdAt'         => $a->getCreatedAt()->format('Y-m-d'),
        ];
    }
}