<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261120203821 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE addons (id BINARY(16) NOT NULL, `key` VARCHAR(50) NOT NULL, name VARCHAR(255) NOT NULL, description LONGTEXT DEFAULT NULL, price_cents INT DEFAULT NULL, min_plan VARCHAR(20) DEFAULT NULL, included_from_plan VARCHAR(20) DEFAULT NULL, icon VARCHAR(50) DEFAULT \'extension\' NOT NULL, status VARCHAR(20) DEFAULT \'active\' NOT NULL, sort_order INT DEFAULT 0 NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, UNIQUE INDEX UNIQ_DB6526374E645A7E (`key`), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE plan_prices (plan VARCHAR(20) NOT NULL, price_cents INT NOT NULL, currency VARCHAR(3) DEFAULT \'EUR\' NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY (plan)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE reservation_packages (id BINARY(16) NOT NULL, package_id VARCHAR(64) NOT NULL, package_name VARCHAR(255) NOT NULL, price_per_person INT DEFAULT NULL, quantity INT NOT NULL, reservation_id BINARY(16) NOT NULL, INDEX IDX_60022B3B83297E7 (reservation_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE whatsapp_conversations (id BINARY(16) NOT NULL, guest_phone VARCHAR(20) NOT NULL, guest_wa_name VARCHAR(255) DEFAULT NULL, state VARCHAR(30) DEFAULT \'awaiting_party_size\' NOT NULL, draft_party_size SMALLINT DEFAULT NULL, draft_date DATE DEFAULT NULL, draft_time VARCHAR(5) DEFAULT NULL, draft_name VARCHAR(255) DEFAULT NULL, offered_slots JSON DEFAULT NULL, reservation_id BINARY(16) DEFAULT NULL, last_inbound_message_id VARCHAR(128) DEFAULT NULL, retry_count SMALLINT DEFAULT 0 NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, venue_id BINARY(16) DEFAULT NULL, INDEX idx_whatsapp_conversations_tenant_phone (tenant_id, guest_phone), INDEX idx_whatsapp_conversations_last_msg (last_inbound_message_id), INDEX IDX_9E6ECFF9033212A (tenant_id), INDEX IDX_9E6ECFF40A73EBA (venue_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE whatsapp_message_log (id BINARY(16) NOT NULL, tenant_id BINARY(16) DEFAULT NULL, conversation_id BINARY(16) DEFAULT NULL, direction VARCHAR(10) NOT NULL, wa_message_id VARCHAR(128) DEFAULT NULL, phone VARCHAR(20) NOT NULL, body LONGTEXT DEFAULT NULL, payload JSON DEFAULT NULL, created_at DATETIME NOT NULL, INDEX idx_whatsapp_message_log_tenant (tenant_id), INDEX idx_whatsapp_message_log_wa_message_id (wa_message_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE reservation_packages ADD CONSTRAINT FK_60022B3B83297E7 FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE whatsapp_conversations ADD CONSTRAINT FK_9E6ECFF9033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE whatsapp_conversations ADD CONSTRAINT FK_9E6ECFF40A73EBA FOREIGN KEY (venue_id) REFERENCES venues (id)');
        $this->addSql('ALTER TABLE reservations ADD staff_actions JSON DEFAULT NULL');
        $this->addSql('ALTER TABLE tenants ADD whatsapp_phone_number_id VARCHAR(64) DEFAULT NULL, ADD whatsapp_channel_id VARCHAR(64) DEFAULT NULL, ADD whatsapp_config JSON DEFAULT NULL');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_B8FC96BB848554AD ON tenants (whatsapp_phone_number_id)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_B8FC96BB5022559 ON tenants (whatsapp_channel_id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE reservation_packages DROP FOREIGN KEY FK_60022B3B83297E7');
        $this->addSql('ALTER TABLE whatsapp_conversations DROP FOREIGN KEY FK_9E6ECFF9033212A');
        $this->addSql('ALTER TABLE whatsapp_conversations DROP FOREIGN KEY FK_9E6ECFF40A73EBA');
        $this->addSql('DROP TABLE addons');
        $this->addSql('DROP TABLE plan_prices');
        $this->addSql('DROP TABLE reservation_packages');
        $this->addSql('DROP TABLE whatsapp_conversations');
        $this->addSql('DROP TABLE whatsapp_message_log');
        $this->addSql('ALTER TABLE reservations DROP staff_actions');
        $this->addSql('DROP INDEX UNIQ_B8FC96BB848554AD ON tenants');
        $this->addSql('DROP INDEX UNIQ_B8FC96BB5022559 ON tenants');
        $this->addSql('ALTER TABLE tenants DROP whatsapp_phone_number_id, DROP whatsapp_channel_id, DROP whatsapp_config');
    }
}
