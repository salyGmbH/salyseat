<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261117185027 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE reservations ADD mews_reservation_id VARCHAR(255) DEFAULT NULL, ADD pms_sync_status VARCHAR(20) DEFAULT NULL');
        $this->addSql('ALTER TABLE tenants ADD pms_config JSON DEFAULT NULL, ADD contact_email VARCHAR(255) DEFAULT NULL, ADD contact_phone VARCHAR(50) DEFAULT NULL, ADD address JSON DEFAULT NULL, ADD billing_address JSON DEFAULT NULL, ADD internal_notes LONGTEXT DEFAULT NULL, ADD contract_duration VARCHAR(20) DEFAULT NULL, ADD cancellation_period VARCHAR(20) DEFAULT NULL, ADD contract_start DATE DEFAULT NULL');
        $this->addSql('ALTER TABLE voucher_configs ADD postal_enabled TINYINT DEFAULT 0 NOT NULL, ADD postal_shipping_cost NUMERIC(10, 2) DEFAULT NULL');
        $this->addSql('ALTER TABLE vouchers ADD delivery_method VARCHAR(20) DEFAULT \'email\' NOT NULL, ADD postal_address JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE reservations DROP mews_reservation_id, DROP pms_sync_status');
        $this->addSql('ALTER TABLE tenants DROP pms_config, DROP contact_email, DROP contact_phone, DROP address, DROP billing_address, DROP internal_notes, DROP contract_duration, DROP cancellation_period, DROP contract_start');
        $this->addSql('ALTER TABLE voucher_configs DROP postal_enabled, DROP postal_shipping_cost');
        $this->addSql('ALTER TABLE vouchers DROP delivery_method, DROP postal_address');
    }
}
