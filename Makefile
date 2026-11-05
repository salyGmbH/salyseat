# Salyseat – Kurzbefehle. "make" oder "make help" zeigt alle an.
.DEFAULT_GOAL := help
.PHONY: help up down restart ps logs logs-php logs-worker shell composer console \
        jwt-keys db-create migrate-diff migrate fixtures cache-clear routes test \
        db-shell admin widget urls

DC   = docker compose
PHP  = $(DC) exec php
CONS = $(PHP) php bin/console

help: ## Zeigt diese Hilfe
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ── Docker ───────────────────────────────────────────────
up: ## Container bauen und starten
	$(DC) up -d --build

down: ## Container stoppen
	$(DC) down

restart: ## Container neu starten
	$(DC) restart

ps: ## Status der Container
	$(DC) ps

logs: ## Logs aller Container live ansehen
	$(DC) logs -f

logs-php: ## Nur PHP-Logs
	$(DC) logs -f php

logs-worker: ## Nur Messenger-Worker-Logs
	$(DC) logs -f messenger_worker

# ── Symfony ──────────────────────────────────────────────
shell: ## Shell im PHP-Container öffnen
	$(PHP) bash

composer: ## composer install im Container
	$(PHP) composer install

console: ## Beliebiger Console-Befehl, z. B. make console c="debug:router"
	$(CONS) $(c)

jwt-keys: ## JWT-Schlüssel erzeugen (einmalig)
	$(CONS) lexik:jwt:generate-keypair --skip-if-exists

cache-clear: ## Symfony-Cache leeren
	$(CONS) cache:clear

routes: ## Alle Routen anzeigen
	$(CONS) debug:router

# ── Datenbank ────────────────────────────────────────────
db-create: ## Datenbank anlegen
	$(CONS) doctrine:database:create --if-not-exists

migrate-diff: ## Migration aus den Entities erzeugen
	$(CONS) doctrine:migrations:diff

migrate: ## Migrationen ausführen
	$(CONS) doctrine:migrations:migrate --no-interaction --allow-no-migration

fixtures: ## Testdaten laden (nur dev)
	$(CONS) doctrine:fixtures:load --no-interaction

db-shell: ## MySQL-Konsole
	$(DC) exec mysql mysql -usalyseat -psecret salyseat

# ── Tests ────────────────────────────────────────────────
test: ## PHPUnit-Tests ausführen
	$(PHP) php bin/phpunit

# ── Angular ──────────────────────────────────────────────
admin: ## Admin-App starten (http://localhost:4300)
	cd admin && npm start

widget: ## Widget-App starten (http://localhost:4301)
	cd widget && npm start

urls: ## Alle lokalen Adressen anzeigen
	@echo ""
	@echo "  Backend-API:  http://localhost:8010"
	@echo "  phpMyAdmin:   http://localhost:8093"
	@echo "  Mailpit:      http://localhost:8028"
	@echo "  Admin-App:    http://localhost:4300"
	@echo "  Widget-App:   http://localhost:4301"
	@echo "  MySQL:        localhost:3311  (User salyseat / PW secret)"
	@echo ""
