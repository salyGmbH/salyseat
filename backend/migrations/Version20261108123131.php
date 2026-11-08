<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261108123131 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE notizen (id BINARY(16) NOT NULL, date VARCHAR(10) NOT NULL, time VARCHAR(5) DEFAULT NULL, title VARCHAR(255) NOT NULL, text LONGTEXT DEFAULT NULL, color VARCHAR(20) DEFAULT \'default\' NOT NULL, done TINYINT DEFAULT 0 NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, created_by_id BINARY(16) DEFAULT NULL, INDEX IDX_1EDD95F49033212A (tenant_id), INDEX IDX_1EDD95F4B03A8386 (created_by_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE notizen ADD CONSTRAINT FK_1EDD95F49033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE notizen ADD CONSTRAINT FK_1EDD95F4B03A8386 FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE SET NULL');
        $this->addSql('ALTER TABLE reservations ADD table_number INT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE notizen DROP FOREIGN KEY FK_1EDD95F49033212A');
        $this->addSql('ALTER TABLE notizen DROP FOREIGN KEY FK_1EDD95F4B03A8386');
        $this->addSql('DROP TABLE notizen');
        $this->addSql('ALTER TABLE reservations DROP table_number');
    }
}
