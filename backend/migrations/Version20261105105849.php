<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261105105849 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE guests (id BINARY(16) NOT NULL, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, phone VARCHAR(20) DEFAULT NULL, internal_notes LONGTEXT DEFAULT NULL, blocked TINYINT DEFAULT 0 NOT NULL, blocked_reason VARCHAR(255) DEFAULT NULL, total_reservations INT DEFAULT 0 NOT NULL, no_show_count INT DEFAULT 0 NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX uq_guest_tenant_email (tenant_id, email), INDEX IDX_4D11BCB29033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE opening_hours (id BINARY(16) NOT NULL, weekday SMALLINT NOT NULL, open TINYINT DEFAULT 1 NOT NULL, open_time VARCHAR(5) DEFAULT NULL, close_time VARCHAR(5) DEFAULT NULL, breaks JSON DEFAULT NULL, venue_id BINARY(16) NOT NULL, UNIQUE INDEX uq_venue_weekday (venue_id, weekday), INDEX IDX_2640C10B40A73EBA (venue_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE special_closings (id BINARY(16) NOT NULL, date_from DATE NOT NULL, date_to DATE NOT NULL, reason VARCHAR(255) DEFAULT NULL, full_day TINYINT DEFAULT 1 NOT NULL, open_time VARCHAR(5) DEFAULT NULL, close_time VARCHAR(5) DEFAULT NULL, created_at DATETIME NOT NULL, venue_id BINARY(16) NOT NULL, INDEX IDX_57EA91E240A73EBA (venue_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE guests ADD CONSTRAINT FK_4D11BCB29033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE opening_hours ADD CONSTRAINT FK_2640C10B40A73EBA FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE special_closings ADD CONSTRAINT FK_57EA91E240A73EBA FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE reservations ADD guest_id BINARY(16) DEFAULT NULL');
        $this->addSql('ALTER TABLE reservations ADD CONSTRAINT FK_4DA2399A4AA658 FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX IDX_4DA2399A4AA658 ON reservations (guest_id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE reservations DROP FOREIGN KEY FK_4DA2399A4AA658');
        $this->addSql('DROP INDEX IDX_4DA2399A4AA658 ON reservations');
        $this->addSql('ALTER TABLE reservations DROP guest_id');
        $this->addSql('ALTER TABLE guests DROP FOREIGN KEY FK_4D11BCB29033212A');
        $this->addSql('ALTER TABLE opening_hours DROP FOREIGN KEY FK_2640C10B40A73EBA');
        $this->addSql('ALTER TABLE special_closings DROP FOREIGN KEY FK_57EA91E240A73EBA');
        $this->addSql('DROP TABLE guests');
        $this->addSql('DROP TABLE opening_hours');
        $this->addSql('DROP TABLE special_closings');
    }
}
