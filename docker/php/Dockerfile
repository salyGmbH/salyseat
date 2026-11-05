FROM php:8.4-fpm

# Systempakete und PHP-Erweiterungen, die Symfony + Doctrine + Messenger brauchen
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        unzip \
        libicu-dev \
        libzip-dev \
        libonig-dev \
    && docker-php-ext-install \
        pdo_mysql \
        intl \
        zip \
        mbstring \
        opcache \
        pcntl \
        bcmath \
        sockets \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Composer aus dem offiziellen Image übernehmen
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/backend

# Gleiche User-ID wie auf dem Mac, damit Dateien nicht root gehören
RUN usermod -u 1000 www-data

USER www-data
