PYTHON ?= python3
JOBS ?= 2
VERSION := $(shell cat VERSION)

.PHONY: check test native pong source source-candidate

check:
	$(PYTHON) tools/check.py

test: check
	$(PYTHON) tests/test-release-tools.py
	$(PYTHON) tests/test-game-audits.py

native: check
	./tools/build-native.sh --jobs $(JOBS)

pong:
	./tools/capture-pong.sh

source: check
	$(PYTHON) tools/package-release.py --tag v$(VERSION)

source-candidate: check
	$(PYTHON) tools/package-release.py --candidate
