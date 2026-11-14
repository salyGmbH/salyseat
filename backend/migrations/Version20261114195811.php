<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261114195811 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE table_blocks (id BINARY(16) NOT NULL, table_number INT NOT NULL, date_from DATE NOT NULL, date_to DATE NOT NULL, reason VARCHAR(255) DEFAULT NULL, full_day TINYINT DEFAULT 1 NOT NULL, time_from VARCHAR(5) DEFAULT NULL, time_to VARCHAR(5) DEFAULT NULL, created_at DATETIME NOT NULL, venue_id BINARY(16) NOT NULL, INDEX IDX_903F90BB40A73EBA (venue_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE table_blocks ADD CONSTRAINT FK_903F90BB40A73EBA FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE reservations ADD table_ids JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE table_blocks DROP FOREIGN KEY FK_903F90BB40A73EBA');
        $this->addSql('DROP TABLE table_blocks');
        $this->addSql('ALTER TABLE reservations DROP table_ids');
    }
}
