<?php

declare(strict_types=1);

namespace App\Module\Pms\Infrastructure\Mews;

use App\Module\Pms\Domain\Gateway\PmsConnectorInterface;
use App\Module\Reservation\Domain\Entity\Reservation;
use Psr\Log\LoggerInterface;

final class MewsConnector implements PmsConnectorInterface
{
    public function __construct(
        private readonly string $clientToken,
        private readonly string $accessToken,
        private readonly string $serviceId,
        private readonly string $resourceCategoryId,
        private readonly string $rateId,
        private readonly string $ageCategoryId,
        private readonly string $baseUrl,
        private readonly bool $enabled,
        private readonly LoggerInterface $logger,
    ) {}

    public function isEnabled(): bool
    {
        return $this->enabled
            && $this->clientToken !== ''
            && $this->accessToken !== ''
            && $this->serviceId !== '';
    }

    public function pushReservation(Reservation $reservation): string
    {
        $customerId = $this->syncCustomer($reservation);

        $response = $this->post('/api/connector/v1/reservations/add', [
            ...$this->auth(),
            'ServiceId'             => $this->serviceId,
            'SendConfirmationEmail' => false,
            'CheckOverbooking'      => false,
            'Reservations'          => [[
                'Identifier'          => $reservation->getId()->toRfc4122(),
                'StartUtc'            => $reservation->getStartsAt()->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z'),
                'EndUtc'              => $reservation->getEndsAt()->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z'),
                'CustomerId'          => $customerId,
                'RequestedCategoryId' => $this->resourceCategoryId,
                'RateId'              => $this->rateId,
                'PersonCounts'        => [[
                    'AgeCategoryId' => $this->ageCategoryId,
                    'Count'         => $reservation->getPartySize(),
                ]],
                'Notes'               => sprintf(
                    '%d Personen%s',
                    $reservation->getPartySize(),
                    $reservation->getGuestNotes() !== null ? ' — ' . $reservation->getGuestNotes() : '',
                ),
            ]],
        ]);

        return $response['Reservations'][0]['Reservation']['Id'];
    }

    public function cancelReservation(string $externalId): void
    {
        $this->post('/api/connector/v1/reservations/cancel', [
            ...$this->auth(),
            'ReservationIds'         => [$externalId],
            'ChargeCancellationFees' => false,
            'Notes'                  => 'Storniert via LydandroBooking',
        ]);
    }

    public function searchGuests(string $query): array
    {
        $query = trim($query);
        if ($query === '') {
            return [];
        }

        $parts = explode(' ', $query, 2);

        $payload = [
            ...$this->auth(),
            'ActivityStates' => ['Active'],
            'Limitation'     => ['Count' => 20],
        ];

        if (str_contains($query, '@')) {
            $payload['Emails'] = [$query];
        } elseif (count($parts) === 2) {
            $payload['FirstNames'] = [$parts[0]];
            $payload['LastNames']  = [$parts[1]];
        } else {
            $payload['LastNames'] = [$query];
        }

        $response = $this->post('/api/connector/v1/customers/getAll', $payload);

        return array_map([$this, 'mapCustomer'], $response['Customers'] ?? []);
    }

    public function getInHouseGuests(): array
    {
        $now        = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $todayStart = $now->setTime(0, 0, 0)->format('Y-m-d\TH:i:s\Z');
        $todayEnd   = $now->setTime(23, 59, 59)->format('Y-m-d\TH:i:s\Z');

        $response = $this->post('/api/connector/v1/reservations/getAll', [
            ...$this->auth(),
            'States'     => ['Started'],
            'StartUtc'   => $todayStart,
            'EndUtc'     => $todayEnd,
            'TimeFilter' => 'Overlapping',
            'Extent'     => ['Reservations' => true, 'Customers' => true, 'Products' => true, 'OrderItems' => true],
            'Limitation' => ['Count' => 50],
        ]);

        $customers = [];
        foreach ($response['Customers'] ?? [] as $c) {
            $customers[$c['Id']] = $c;
        }

        // Frühstück-Produkt-IDs identifizieren
        $breakfastProductIds = [];
        foreach ($response['Products'] ?? [] as $p) {
            if (stripos($p['Name'] ?? '', 'breakfast') !== false || stripos($p['Name'] ?? '', 'frühstück') !== false) {
                $breakfastProductIds[$p['Id']] = true;
            }
        }

        // Reservierung → hat Frühstück gebucht?
        $reservationHasBreakfast = [];
        foreach ($response['OrderItems'] ?? [] as $item) {
            $reservationId = $item['OrderId'] ?? null;
            $productId     = $item['Data']['Value']['ProductId'] ?? null;
            if ($reservationId !== null && $productId !== null && isset($breakfastProductIds[$productId])) {
                $reservationHasBreakfast[$reservationId] = true;
            }
        }

        // Zimmer-IDs sammeln und Namen auflösen
        $resourceIds = array_filter(array_unique(
            array_column($response['Reservations'] ?? [], 'AssignedResourceId')
        ));

        $roomNames = [];
        if (!empty($resourceIds)) {
            try {
                $rooms = $this->post('/api/connector/v1/resources/getAll', [
                    ...$this->auth(),
                    'ResourceIds' => array_values($resourceIds),
                    'Limitation'  => ['Count' => 200],
                ]);
                foreach ($rooms['Resources'] ?? [] as $room) {
                    $roomNames[$room['Id']] = $room['Name'] ?? null;
                }
            } catch (\Throwable) {
                // Zimmernamen optional — kein Fehler werfen
            }
        }

        $seen   = [];
        $result = [];
        foreach ($response['Reservations'] ?? [] as $r) {
            $customerId = $r['CustomerId'] ?? null;
            $customer   = $customerId !== null ? ($customers[$customerId] ?? null) : null;
            if ($customer === null || isset($seen[$customerId])) {
                continue;
            }
            $seen[$customerId] = true;

            $resourceId = $r['AssignedResourceId'] ?? null;
            $roomNumber = $resourceId !== null ? ($roomNames[$resourceId] ?? null) : null;

            $result[] = array_merge(
                $this->mapCustomer($customer),
                [
                    'checkIn'         => $r['StartUtc'] ?? '',
                    'checkOut'        => $r['EndUtc'] ?? '',
                    'roomNumber'      => $roomNumber,
                    'adultCount'      => $r['AdultCount'] ?? 1,
                    'childCount'      => $r['ChildCount'] ?? 0,
                    'hasBreakfast'    => isset($reservationHasBreakfast[$r['Id']]),
                    'nationalityCode' => $customer['NationalityCode'] ?? null,
                ]
            );
        }

        return $result;
    }

    private function syncCustomer(Reservation $reservation): string
    {
        $response = $this->post('/api/connector/v1/customers/getAll', [
            ...$this->auth(),
            'Emails'     => [$reservation->getGuestEmail()],
            'Limitation' => ['Count' => 1],
        ]);

        if (!empty($response['Customers'])) {
            return $response['Customers'][0]['Id'];
        }

        [$firstName, $lastName] = $this->splitName($reservation->getGuestName());

        $created = $this->post('/api/connector/v1/customers/add', [
            ...$this->auth(),
            'FirstName' => $firstName,
            'LastName'  => $lastName,
            'Email'     => $reservation->getGuestEmail(),
            'Phone'     => $reservation->getGuestPhone(),
        ]);

        return $created['Id'];
    }

    /** @return array{id: string, firstName: string, lastName: string, email: string|null, phone: string|null, number: string} */
    private function mapCustomer(array $c): array
    {
        return [
            'id'        => $c['Id'],
            'firstName' => $c['FirstName'] ?? '',
            'lastName'  => $c['LastName'] ?? '',
            'email'     => $c['Email'] ?? null,
            'phone'     => $c['Phone'] ?? null,
            'number'    => $c['Number'] ?? '',
        ];
    }

    /**
     * @return array<string, mixed>
     * @throws \RuntimeException on HTTP error
     */
    private function post(string $endpoint, array $payload): array
    {
        $url  = rtrim($this->baseUrl, '/') . $endpoint;
        $body = json_encode($payload, JSON_THROW_ON_ERROR);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
        ]);

        $raw    = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error  = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new \RuntimeException("Mews cURL error: $error");
        }

        if ($status >= 400) {
            $this->logger->error('Mews API Fehler', ['status' => $status, 'body' => $raw, 'endpoint' => $endpoint]);
            throw new \RuntimeException("Mews API error HTTP $status: $raw");
        }

        return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array{ClientToken: string, AccessToken: string, Client: string} */
    private function auth(): array
    {
        return [
            'ClientToken' => $this->clientToken,
            'AccessToken' => $this->accessToken,
            'Client'      => 'LydandroBooking v1.0',
        ];
    }

    /** @return array{0: string, 1: string} */
    private function splitName(string $fullName): array
    {
        $parts = explode(' ', trim($fullName), 2);
        return [$parts[0], $parts[1] ?? $parts[0]];
    }
}