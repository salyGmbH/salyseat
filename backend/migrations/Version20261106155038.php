<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261106155038 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE staff (id BINARY(16) NOT NULL, employee_number SMALLINT UNSIGNED NOT NULL, name VARCHAR(255) NOT NULL, email VARCHAR(255) DEFAULT NULL, role VARCHAR(20) DEFAULT \'staff\' NOT NULL, active TINYINT DEFAULT 1 NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX uq_staff_tenant_number (tenant_id, employee_number), INDEX IDX_426EF3929033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE staff ADD CONSTRAINT FK_426EF3929033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE tenants ADD ui_settings JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE staff DROP FOREIGN KEY FK_426EF3929033212A');
        $this->addSql('DROP TABLE staff');
        $this->addSql('ALTER TABLE tenants DROP ui_settings');
    }
}
