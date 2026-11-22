<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261122115359 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE shift_settings ADD shift_times JSON DEFAULT NULL, ADD user_shifts JSON DEFAULT NULL');
        $this->addSql('ALTER TABLE shifts CHANGE type type VARCHAR(36) NOT NULL');
        $this->addSql('ALTER TABLE tenants ADD calendar_feed_token VARCHAR(64) DEFAULT NULL');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_B8FC96BB3CF23682 ON tenants (calendar_feed_token)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE shift_settings DROP shift_times, DROP user_shifts');
        $this->addSql('ALTER TABLE shifts CHANGE type type VARCHAR(20) NOT NULL');
        $this->addSql('DROP INDEX UNIQ_B8FC96BB3CF23682 ON tenants');
        $this->addSql('ALTER TABLE tenants DROP calendar_feed_token');
    }
}
