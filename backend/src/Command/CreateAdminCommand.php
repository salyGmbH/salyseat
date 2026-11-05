<?php

declare(strict_types=1);

namespace App\Command;

use App\Module\Tenant\Domain\Entity\Tenant;
use App\Module\User\Domain\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Legt einen Admin-User (inkl. optionalem Tenant) direkt in der Datenbank an.
 *
 * Beispiele:
 *   php bin/console app:create-admin info@saly.tech 1234
 *   php bin/console app:create-admin info@saly.tech 1234 --tenant="Salyseat Restaurant"
 *
 * Ist die E-Mail schon vergeben, wird das Passwort des bestehenden Users
 * überschrieben (praktisch für "hab's vergessen, setz mir einfach neu").
 */
#[AsCommand(
    name: 'app:create-admin',
    description: 'Legt einen Admin-User an oder setzt dessen Passwort neu.'
)]
class CreateAdminCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface       $em,
        private readonly UserPasswordHasherInterface  $hasher,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('email',    InputArgument::REQUIRED, 'E-Mail des Admins')
            ->addArgument('password', InputArgument::REQUIRED, 'Klartext-Passwort')
            ->addOption('tenant',     't', InputOption::VALUE_REQUIRED,
                'Name eines Tenants, der (falls noch nicht vorhanden) mit angelegt wird.')
            ->addOption('super',      null, InputOption::VALUE_NONE,
                'Auch ROLE_SUPER_ADMIN vergeben.');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io       = new SymfonyStyle($input, $output);
        $email    = (string) $input->getArgument('email');
        $password = (string) $input->getArgument('password');
        $tenantName = $input->getOption('tenant');
        $super      = (bool) $input->getOption('super');

        $roles = ['ROLE_TENANT_ADMIN'];
        if ($super) {
            $roles[] = 'ROLE_SUPER_ADMIN';
        }

        // ── Tenant (optional) ────────────────────────────────────────────────
        $tenant = null;
        if ($tenantName) {
            $slug = $this->slugify($tenantName);
            $tenant = $this->em->getRepository(Tenant::class)->findOneBy(['slug' => $slug]);
            if ($tenant === null) {
                $tenant = new Tenant($tenantName, $slug);
                $this->em->persist($tenant);
                $io->writeln(sprintf('  <info>✓</info> Tenant <comment>%s</comment> angelegt.', $tenantName));
            } else {
                $io->writeln(sprintf('  <info>✓</info> Tenant <comment>%s</comment> bereits vorhanden, wird wiederverwendet.', $tenantName));
            }
        }

        // ── User: anlegen oder Passwort neu setzen ───────────────────────────
        $userRepo = $this->em->getRepository(User::class);
        $existing = $userRepo->findOneBy(['email' => $email]);

        if ($existing !== null) {
            $existing->setPassword($this->hasher->hashPassword($existing, $password));
            if ($tenant !== null) {
                $existing->setTenant($tenant);
            }
            $this->em->flush();

            $io->success("Passwort für bestehenden User '$email' wurde neu gesetzt.");
            return Command::SUCCESS;
        }

        $user = new User($email, $roles);
        if ($tenant !== null) {
            $user->setTenant($tenant);
        }
        $user->setPassword($this->hasher->hashPassword($user, $password));

        $this->em->persist($user);
        $this->em->flush();

        $io->success(sprintf(
            "Admin-User '%s' wurde angelegt.%s",
            $email,
            $tenant ? " Tenant: {$tenantName}." : ''
        ));
        $io->writeln("  Rollen: " . implode(', ', $roles));

        return Command::SUCCESS;
    }

    private function slugify(string $value): string
    {
        $s = strtolower($value);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? $value;
        return trim($s, '-');
    }
}