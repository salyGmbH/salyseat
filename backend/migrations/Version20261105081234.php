<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261105081234 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE reservations (id BINARY(16) NOT NULL, token VARCHAR(64) NOT NULL, guest_name VARCHAR(255) NOT NULL, guest_email VARCHAR(255) NOT NULL, guest_phone VARCHAR(20) DEFAULT NULL, guest_notes LONGTEXT DEFAULT NULL, party_size INT NOT NULL, starts_at DATETIME NOT NULL, ends_at DATETIME NOT NULL, status VARCHAR(20) DEFAULT \'pending\' NOT NULL, admin_notes LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, venue_id BINARY(16) NOT NULL, UNIQUE INDEX UNIQ_4DA2395F37A13B (token), INDEX IDX_4DA23940A73EBA (venue_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE resources (id BINARY(16) NOT NULL, name VARCHAR(255) NOT NULL, capacity INT NOT NULL, active TINYINT DEFAULT 1 NOT NULL, venue_id BINARY(16) NOT NULL, INDEX IDX_EF66EBAE40A73EBA (venue_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE tenant_branding (id BINARY(16) NOT NULL, primary_color VARCHAR(7) DEFAULT \'#2563eb\' NOT NULL, primary_color_hover VARCHAR(7) DEFAULT \'#1d4ed8\' NOT NULL, background_color VARCHAR(7) DEFAULT \'#ffffff\' NOT NULL, text_color VARCHAR(7) DEFAULT \'#111827\' NOT NULL, font_family VARCHAR(100) DEFAULT \'Inter\' NOT NULL, base_font_size VARCHAR(4) DEFAULT \'14px\' NOT NULL, border_radius VARCHAR(20) DEFAULT \'8px\' NOT NULL, button_style VARCHAR(10) DEFAULT \'filled\' NOT NULL, logo_url VARCHAR(500) DEFAULT NULL, widget_title VARCHAR(255) DEFAULT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX UNIQ_93FDECA09033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE tenants (id BINARY(16) NOT NULL, name VARCHAR(255) NOT NULL, slug VARCHAR(100) NOT NULL, public_key VARCHAR(64) NOT NULL, plan VARCHAR(50) DEFAULT \'trial\' NOT NULL, active TINYINT DEFAULT 1 NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, UNIQUE INDEX UNIQ_B8FC96BB989D9B62 (slug), UNIQUE INDEX UNIQ_B8FC96BB66F9D463 (public_key), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE users (id BINARY(16) NOT NULL, email VARCHAR(180) NOT NULL, password VARCHAR(255) NOT NULL, first_name VARCHAR(100) DEFAULT NULL, last_name VARCHAR(100) DEFAULT NULL, roles JSON NOT NULL, active TINYINT DEFAULT 1 NOT NULL, created_at DATETIME NOT NULL, tenant_id BINARY(16) DEFAULT NULL, UNIQUE INDEX UNIQ_1483A5E9E7927C74 (email), INDEX IDX_1483A5E99033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE venues (id BINARY(16) NOT NULL, name VARCHAR(255) NOT NULL, category VARCHAR(50) NOT NULL, description VARCHAR(500) DEFAULT NULL, address VARCHAR(255) DEFAULT NULL, timezone VARCHAR(100) DEFAULT \'Europe/Berlin\' NOT NULL, phone VARCHAR(20) DEFAULT NULL, email VARCHAR(255) DEFAULT NULL, default_duration_minutes INT DEFAULT 90 NOT NULL, max_advance_booking_days INT DEFAULT 60 NOT NULL, min_advance_booking_hours INT DEFAULT 2 NOT NULL, active TINYINT DEFAULT 1 NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, INDEX IDX_652E22AD9033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE reservations ADD CONSTRAINT FK_4DA23940A73EBA FOREIGN KEY (venue_id) REFERENCES venues (id)');
        $this->addSql('ALTER TABLE resources ADD CONSTRAINT FK_EF66EBAE40A73EBA FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE tenant_branding ADD CONSTRAINT FK_93FDECA09033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE users ADD CONSTRAINT FK_1483A5E99033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE venues ADD CONSTRAINT FK_652E22AD9033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE reservations DROP FOREIGN KEY FK_4DA23940A73EBA');
        $this->addSql('ALTER TABLE resources DROP FOREIGN KEY FK_EF66EBAE40A73EBA');
        $this->addSql('ALTER TABLE tenant_branding DROP FOREIGN KEY FK_93FDECA09033212A');
        $this->addSql('ALTER TABLE users DROP FOREIGN KEY FK_1483A5E99033212A');
        $this->addSql('ALTER TABLE venues DROP FOREIGN KEY FK_652E22AD9033212A');
        $this->addSql('DROP TABLE reservations');
        $this->addSql('DROP TABLE resources');
        $this->addSql('DROP TABLE tenant_branding');
        $this->addSql('DROP TABLE tenants');
        $this->addSql('DROP TABLE users');
        $this->addSql('DROP TABLE venues');
    }
}
