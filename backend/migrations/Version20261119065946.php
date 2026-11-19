<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261119065946 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE waitlist_entries (id BINARY(16) NOT NULL, requested_at DATETIME NOT NULL, party_size INT NOT NULL, guest_name VARCHAR(255) NOT NULL, guest_email VARCHAR(255) NOT NULL, guest_phone VARCHAR(20) DEFAULT NULL, notes LONGTEXT DEFAULT NULL, status VARCHAR(20) DEFAULT \'waiting\' NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, venue_id BINARY(16) NOT NULL, INDEX idx_waitlist_tenant (tenant_id), INDEX idx_waitlist_venue_requested (venue_id, requested_at), INDEX IDX_E74550EE40A73EBA (venue_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE waitlist_entries ADD CONSTRAINT FK_E74550EE9033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE waitlist_entries ADD CONSTRAINT FK_E74550EE40A73EBA FOREIGN KEY (venue_id) REFERENCES venues (id)');
        $this->addSql('ALTER TABLE reservations ADD hotel_room_number VARCHAR(20) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE waitlist_entries DROP FOREIGN KEY FK_E74550EE9033212A');
        $this->addSql('ALTER TABLE waitlist_entries DROP FOREIGN KEY FK_E74550EE40A73EBA');
        $this->addSql('DROP TABLE waitlist_entries');
        $this->addSql('ALTER TABLE reservations DROP hotel_room_number');
    }
}
