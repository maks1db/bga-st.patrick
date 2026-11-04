BGA_USER   := YOUR_STUDIO_USERNAME
BGA_HOST   := 1.studio.boardgamearena.com
BGA_PORT   := 2022
BGA_GAME   := stpatrick
BGA_REMOTE := $(BGA_GAME)
BGA_KEY    := $(HOME)/.ssh/id_rsa_bga
BGA_SCP    := scp -i $(BGA_KEY) -P $(BGA_PORT) -o IdentitiesOnly=yes

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
	$(BGA_SCP) img/* $(BGA_USER)@$(BGA_HOST):$(BGA_REMOTE)/img/
	@echo "OK Deployed"
