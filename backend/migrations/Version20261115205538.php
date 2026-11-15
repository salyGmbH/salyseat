<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261115205538 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE shift_availability (id BINARY(16) NOT NULL, employee_id VARCHAR(36) NOT NULL, weekday SMALLINT UNSIGNED NOT NULL, type VARCHAR(20) NOT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX uq_avail_emp_day (tenant_id, employee_id, weekday), INDEX IDX_CCA536759033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE shift_settings (id BINARY(16) NOT NULL, overtime_limit SMALLINT UNSIGNED DEFAULT 40 NOT NULL, min_staff JSON NOT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX uq_settings_tenant (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE shift_swap_requests (id BINARY(16) NOT NULL, from_employee_id VARCHAR(36) NOT NULL, to_employee_id VARCHAR(36) NOT NULL, date DATE NOT NULL, status VARCHAR(20) DEFAULT \'pending\' NOT NULL, note LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, INDEX idx_swaps_tenant (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE shift_templates (id BINARY(16) NOT NULL, name VARCHAR(255) NOT NULL, entries JSON NOT NULL, created_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, INDEX idx_templates_tenant (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE shift_wages (id BINARY(16) NOT NULL, employee_id VARCHAR(36) NOT NULL, hourly_rate NUMERIC(8, 2) NOT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX uq_wages_emp (tenant_id, employee_id), INDEX IDX_99BADF3B9033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE shifts (id BINARY(16) NOT NULL, employee_id VARCHAR(36) NOT NULL, date DATE NOT NULL, type VARCHAR(20) NOT NULL, start_time VARCHAR(5) DEFAULT NULL, end_time VARCHAR(5) DEFAULT NULL, note LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, INDEX idx_shifts_tenant_date (tenant_id, date), UNIQUE INDEX uq_shift_emp_date (tenant_id, employee_id, date), INDEX IDX_1D1D712F9033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE voucher_configs (id BINARY(16) NOT NULL, active_payment_methods JSON NOT NULL, tenant_id BINARY(16) NOT NULL, UNIQUE INDEX UNIQ_81A452349033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE voucher_images (id BINARY(16) NOT NULL, name VARCHAR(255) NOT NULL, url LONGTEXT NOT NULL, active TINYINT DEFAULT 1 NOT NULL, created_at DATETIME NOT NULL, tenant_id BINARY(16) NOT NULL, INDEX IDX_21BB18979033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE vouchers (id BINARY(16) NOT NULL, code VARCHAR(20) NOT NULL, amount NUMERIC(10, 2) NOT NULL, remaining_amount NUMERIC(10, 2) NOT NULL, buyer_name VARCHAR(255) NOT NULL, buyer_email VARCHAR(255) DEFAULT NULL, recipient_name VARCHAR(255) NOT NULL, recipient_email VARCHAR(255) DEFAULT NULL, message LONGTEXT DEFAULT NULL, status VARCHAR(20) DEFAULT \'active\' NOT NULL, expires_at DATE NOT NULL, created_at DATETIME NOT NULL, redeemed_at DATETIME DEFAULT NULL, tenant_id BINARY(16) NOT NULL, INDEX IDX_931507489033212A (tenant_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE shift_availability ADD CONSTRAINT FK_CCA536759033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE shift_settings ADD CONSTRAINT FK_CCF138619033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE shift_swap_requests ADD CONSTRAINT FK_F7854C769033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE shift_templates ADD CONSTRAINT FK_BEBAAEE79033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE shift_wages ADD CONSTRAINT FK_99BADF3B9033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE shifts ADD CONSTRAINT FK_1D1D712F9033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE voucher_configs ADD CONSTRAINT FK_81A452349033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE voucher_images ADD CONSTRAINT FK_21BB18979033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE vouchers ADD CONSTRAINT FK_931507489033212A FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE reservations ADD source VARCHAR(20) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE shift_availability DROP FOREIGN KEY FK_CCA536759033212A');
        $this->addSql('ALTER TABLE shift_settings DROP FOREIGN KEY FK_CCF138619033212A');
        $this->addSql('ALTER TABLE shift_swap_requests DROP FOREIGN KEY FK_F7854C769033212A');
        $this->addSql('ALTER TABLE shift_templates DROP FOREIGN KEY FK_BEBAAEE79033212A');
        $this->addSql('ALTER TABLE shift_wages DROP FOREIGN KEY FK_99BADF3B9033212A');
        $this->addSql('ALTER TABLE shifts DROP FOREIGN KEY FK_1D1D712F9033212A');
        $this->addSql('ALTER TABLE voucher_configs DROP FOREIGN KEY FK_81A452349033212A');
        $this->addSql('ALTER TABLE voucher_images DROP FOREIGN KEY FK_21BB18979033212A');
        $this->addSql('ALTER TABLE vouchers DROP FOREIGN KEY FK_931507489033212A');
        $this->addSql('DROP TABLE shift_availability');
        $this->addSql('DROP TABLE shift_settings');
        $this->addSql('DROP TABLE shift_swap_requests');
        $this->addSql('DROP TABLE shift_templates');
        $this->addSql('DROP TABLE shift_wages');
        $this->addSql('DROP TABLE shifts');
        $this->addSql('DROP TABLE voucher_configs');
        $this->addSql('DROP TABLE voucher_images');
        $this->addSql('DROP TABLE vouchers');
        $this->addSql('ALTER TABLE reservations DROP source');
    }
}
