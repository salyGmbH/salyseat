<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261108191406 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE guests ADD total_revenue_cents INT DEFAULT 0 NOT NULL, ADD birthday DATE DEFAULT NULL, ADD wedding_date DATE DEFAULT NULL, ADD cancellation_count INT DEFAULT 0 NOT NULL, ADD last_visit_at DATE DEFAULT NULL, ADD allergies LONGTEXT DEFAULT NULL, ADD allergene JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE guests DROP total_revenue_cents, DROP birthday, DROP wedding_date, DROP cancellation_count, DROP last_visit_at, DROP allergies, DROP allergene');
    }
}
