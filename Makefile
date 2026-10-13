PYTHON ?= python3
JOBS ?= 2
VERSION := $(shell cat VERSION)

.PHONY: check release-check test native pong reference-games roms rom-compare source source-candidate web-toolchain core core-compare web web-preview web-release browser

check:
	$(PYTHON) tools/check.py

release-check:
	$(PYTHON) tools/release_check.py

test: check
	node tools/render-icons.mjs --check
	$(PYTHON) tests/test-release-check.py
	$(PYTHON) tests/test-release-tools.py
	$(PYTHON) tests/test-game-audits.py
	$(PYTHON) tests/test-reference-analysis.py
	$(PYTHON) tests/test-game-reference-analysis.py
	$(PYTHON) tests/test-breakout-reference-analysis.py
	$(PYTHON) tests/test-full-rgb.py
	$(PYTHON) tests/reference/test_snapshot_ppm.py
	$(PYTHON) tests/reference/test_owned_case.py
	$(PYTHON) tests/test-ci-change.py
	$(PYTHON) tests/test-ci-runtime-baseline.py
	$(PYTHON) tests/test-core-handoff.py
	$(PYTHON) tests/test-web-release.py
	$(PYTHON) tests/test-dev-rom-exclusion.py

native: check
	./tools/build-native.sh --jobs $(JOBS)

pong:
	./tools/capture-pong.sh

reference-games:
	./tools/capture-games.sh

# Private fixtures (development/CI only); see docs/ROMS.md.
roms:
	./tools/fetch-roms.sh

rom-compare:
	$(PYTHON) tools/compare-rom-games.py

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
