# Deploy config is read from .vscode/sftp.json (single source of truth).
SFTP_JSON  := .vscode/sftp.json

BGA_USER   := $(shell jq -r .username $(SFTP_JSON))
BGA_HOST   := $(shell jq -r .host $(SFTP_JSON))
BGA_PORT   := $(shell jq -r .port $(SFTP_JSON))
BGA_KEY    := $(shell jq -r .privateKeyPath $(SFTP_JSON))
BGA_REMOTE := $(shell jq -r '.remotePath | sub("/$$"; "")' $(SFTP_JSON))
BGA_SSH    := -i $(BGA_KEY) -P $(BGA_PORT) -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15
BGA_SCP    := scp $(BGA_SSH)

# Config files: keep the extension the scaffold shipped (.jsonc on recent scaffolds)
DEPLOY_ROOT := dbmodel.sql $(wildcard gameinfos.jsonc gameinfos.inc.php stats.json stats.jsonc gameoptions.json gameoptions.jsonc gamepreferences.json gamepreferences.jsonc)
DEPLOY_PHP  := modules/php/Game.php modules/php/Card.php modules/php/Relic.php
DEPLOY_JS   := modules/js/Game.js

check:
	@php -l modules/php/Game.php
	@php -l modules/php/Card.php
	@php -l modules/php/Relic.php
	@for f in modules/php/States/*.php; do php -l "$$f" || exit 1; done
	@echo "OK PHP"

deploy: check
	$(BGA_SCP) $(DEPLOY_ROOT) $(BGA_USER)@$(BGA_HOST):$(BGA_REMOTE)/
	$(BGA_SCP) stpatrick.css $(BGA_USER)@$(BGA_HOST):$(BGA_REMOTE)/stpatrick.css
	$(BGA_SCP) $(DEPLOY_PHP) $(BGA_USER)@$(BGA_HOST):$(BGA_REMOTE)/modules/php/
	$(BGA_SCP) modules/php/States/*.php $(BGA_USER)@$(BGA_HOST):$(BGA_REMOTE)/modules/php/States/
	$(BGA_SCP) $(DEPLOY_JS) $(BGA_USER)@$(BGA_HOST):$(BGA_REMOTE)/modules/js/
	@echo "OK Deployed"
