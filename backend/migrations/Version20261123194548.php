<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261123194548 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE guest_reviews (id BINARY(16) NOT NULL, reservation_id VARCHAR(36) NOT NULL, guest_name VARCHAR(255) NOT NULL, token VARCHAR(64) NOT NULL, status VARCHAR(20) DEFAULT \'pending\' NOT NULL, rating_service INT DEFAULT NULL, rating_food INT DEFAULT NULL, rating_ambiance INT DEFAULT NULL, rating_value INT DEFAULT NULL, comment LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, submitted_at DATETIME DEFAULT NULL, read_at DATETIME DEFAULT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX UNIQ_29B52F435F37A13B (token), INDEX IDX_29B52F439033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE time_clock_entries (id BINARY(16) NOT NULL, employee_id VARCHAR(36) NOT NULL, clock_in_at DATETIME NOT NULL, clock_out_at DATETIME DEFAULT NULL, note LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, INDEX idx_time_clock_tenant_employee (tenant_id, employee_id), INDEX IDX_29CCC319033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE guest_reviews ADD CONSTRAINT FK_29B52F439033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE time_clock_entries ADD CONSTRAINT FK_29CCC319033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE reservations ADD guest_first_name VARCHAR(255) DEFAULT NULL, ADD occasion VARCHAR(255) DEFAULT NULL, ADD review_request_sent_at DATETIME DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE guest_reviews DROP FOREIGN KEY FK_29B52F439033212A');
        $this->addSql('ALTER TABLE time_clock_entries DROP FOREIGN KEY FK_29CCC319033212A');
        $this->addSql('DROP TABLE guest_reviews');
        $this->addSql('DROP TABLE time_clock_entries');
        $this->addSql('ALTER TABLE reservations DROP guest_first_name, DROP occasion, DROP review_request_sent_at');
    }
}
