PYTHON ?= python3
JOBS ?= 2
VERSION := $(shell cat VERSION)

.PHONY: check release-check test quick reference-full native pong reference-games roms rom-compare source source-candidate web-toolchain core core-compare web web-preview web-release browser

check:
	$(PYTHON) tools/check.py

release-check:
	$(PYTHON) tools/release_check.py

test: check
	$(PYTHON) tests/test-release-check.py
	$(PYTHON) tests/test-release-tools.py
	$(PYTHON) tests/test-game-audits.py
	$(PYTHON) tests/test-reference-analysis.py
	$(PYTHON) tests/test-game-reference-analysis.py
	$(PYTHON) tests/test-breakout-reference-analysis.py
	$(PYTHON) tests/test-full-rgb.py
	$(PYTHON) tests/reference/test_snapshot_ppm.py
	$(PYTHON) tests/reference/test_owned_case.py
	$(PYTHON) tests/test-core-handoff.py
	$(PYTHON) tests/test-reference-cache.py
	$(PYTHON) tests/test-capture-cache-wiring.py
	$(PYTHON) tests/test-ci-scope.py
	$(PYTHON) tests/test-ci-workflow.py
	$(PYTHON) tests/test-strip-rom-report.py
	$(PYTHON) tests/test-web-release.py
	$(PYTHON) tests/test-desktop-acceptance.py
	$(PYTHON) tests/test-manual-checks.py
	$(PYTHON) tests/test-dev-rom-exclusion.py

# Local fast path: build, Pong and one scenario per ROM-free game against cached
# original references. Not the full qualification; see docs/TESTING.md.
quick: test
	./tools/quick-check.sh

# Every original/native/Wasm comparison, as CI runs it (originals may come from
# the reference cache; pass NOCPU_REFERENCE_CACHE= to capture everything fresh).
reference-full: NOCPU_REFERENCE_CACHE ?= build/reference-cache
reference-full:
	NOCPU_REFERENCE_CACHE=$(NOCPU_REFERENCE_CACHE) ./tools/capture-pong.sh
	NOCPU_REFERENCE_CACHE=$(NOCPU_REFERENCE_CACHE) ./tools/capture-games.sh
	$(MAKE) core-compare

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
