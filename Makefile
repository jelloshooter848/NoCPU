PYTHON ?= python3
JOBS ?= 2
VERSION := $(shell cat VERSION)

.PHONY: check test native pong reference-games source source-candidate web-toolchain core core-compare web web-preview web-release browser

check:
	$(PYTHON) tools/check.py

test: check
	$(PYTHON) tests/test-release-tools.py
	$(PYTHON) tests/test-game-audits.py
	$(PYTHON) tests/test-reference-analysis.py
	$(PYTHON) tests/test-game-reference-analysis.py
	$(PYTHON) tests/test-web-release.py

native: check
	./tools/build-native.sh --jobs $(JOBS)

pong:
	./tools/capture-pong.sh

reference-games:
	./tools/capture-games.sh

source: check
	$(PYTHON) tools/package-release.py --tag v$(VERSION)

source-candidate: check
	$(PYTHON) tools/package-release.py --candidate

web-toolchain:
	./tools/install-web-toolchain.sh --browsers

core:
	./tools/build-core.sh all

core-compare:
	build/core/native/pong-runner --output build/core/native-evidence --replay tests/replays/pong.tsv --seed 848 --epochs 2
	node tools/replay-core.mjs
	$(PYTHON) tools/compare-core.py
	./tools/replay-games.sh

web:
	npm run build:web

web-preview: check
	$(PYTHON) tools/package-web.py --preview

web-release: check
	$(PYTHON) tools/package-web.py --tag v$(VERSION)

browser:
	NOCPU_TEST_PACKAGED=1 npm run test:browser
