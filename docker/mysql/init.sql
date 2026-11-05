-- Läuft nur beim allerersten Start (wenn das MySQL-Volume noch leer ist)
SET NAMES utf8mb4;

ALTER DATABASE salyseat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Test-Datenbank für PHPUnit (Doctrine hängt im Test "_test" an den Namen)
CREATE DATABASE IF NOT EXISTS salyseat_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON salyseat_test.* TO 'salyseat'@'%';
FLUSH PRIVILEGES;
