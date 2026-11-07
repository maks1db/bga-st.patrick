# Deploy reads credentials from .vscode/sftp.json (single source of truth),
# the same file the VS Code "SFTP" extension uses. Upload goes through
# misc/bga_sftp.py (paramiko): OpenSSH sftp/scp hang on this server.
# Python env: ~/.bga-tools/venv (paramiko).

BGA_PY         := $(HOME)/.bga-tools/venv/bin/python
BGA_SFTP       := misc/bga_sftp.py
BGA_REMOTE_DIR := /stpatrick

# Config files: keep the extension the scaffold shipped (.jsonc on recent scaffolds)
DEPLOY_ROOT   := dbmodel.sql $(wildcard gameinfos.jsonc gameinfos.inc.php stats.json stats.jsonc gameoptions.json gameoptions.jsonc gamepreferences.json gamepreferences.jsonc)
DEPLOY_PHP    := modules/php/Game.php modules/php/Card.php modules/php/Relic.php
DEPLOY_STATES := $(wildcard modules/php/States/*.php)
DEPLOY_JS     := $(wildcard modules/js/*.js)

check:
	@for f in $(DEPLOY_PHP) $(DEPLOY_STATES); do php -l "$$f" || exit 1; done
	@echo "OK PHP"

deploy: check
	$(BGA_PY) $(BGA_SFTP) put $(DEPLOY_ROOT) $(BGA_REMOTE_DIR)/
	$(BGA_PY) $(BGA_SFTP) put stpatrick.css $(BGA_REMOTE_DIR)/
	$(BGA_PY) $(BGA_SFTP) put $(DEPLOY_PHP) $(BGA_REMOTE_DIR)/modules/php/
	$(BGA_PY) $(BGA_SFTP) put $(DEPLOY_STATES) $(BGA_REMOTE_DIR)/modules/php/States/
	$(BGA_PY) $(BGA_SFTP) put $(DEPLOY_JS) $(BGA_REMOTE_DIR)/modules/js/
	$(BGA_PY) $(BGA_SFTP) put img/* $(BGA_REMOTE_DIR)/img/
	@echo "OK Deployed"
