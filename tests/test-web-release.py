#!/usr/bin/env python3
"""Failure injection for source-bound browser packaging and the release readiness record."""
from __future__ import annotations
import copy
import hashlib
import importlib.util
import json
import shutil
import tempfile
import subprocess
import struct
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('web_package', ROOT / 'tools/package-web.py')
assert spec and spec.loader
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)


class BrowserReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='nocpu-web-release-')
        self.root = Path(self.temp.name) / 'repo'
        (self.root / 'tests').mkdir(parents=True)
        self.dist = self.root / 'build/web'
        (self.dist / 'core').mkdir(parents=True)
        (self.dist / 'assets').mkdir()
        (self.dist / 'index.html').write_text('<html><script src="assets/game.js"></script></html>')
        (self.dist / 'assets/game.js').write_text('const paddle = 1;')
        (self.dist / 'assets/game.css').write_text('canvas {width:100%}')
        (self.dist / 'core/nocpu.js').write_text('export default function NoCPU() {}')
        (self.dist / 'core/nocpu.wasm').write_bytes(b'\x00asm\x01\x00\x00\x00')
        self.digest = web.runtime_digest(web.runtime_files(self.dist))
        self.readiness = {
            'schema_version': 2, 'version': '0.2.0', 'release_ready': True, 'blockers': [],
            'release_scope': 'Test release scope',
            'desktop_acceptance': {'status': 'pending', 'scope': 'Six-game comparisons and desktop browser checks',
                                   'games': [], 'browsers': [], 'evidence': None},
            'physical_device_gate': {'status': 'deferred', 'basis': 'AGENTS.md defers device qualification'},
        }
        self.write_readiness()

    def tearDown(self):
        self.temp.cleanup()

    def write_readiness(self):
        (self.root / 'tests/release-readiness.json').write_text(json.dumps(self.readiness))

    def test_frontend_css_input_worker_and_wasm_changes_change_runtime_identity(self):
        for name in ('index.html', 'assets/game.js', 'assets/game.css', 'core/nocpu.js', 'core/nocpu.wasm'):
            path = self.dist / name
            original = path.read_bytes()
            path.write_bytes(original + b'\nchanged')
            with self.subTest(name=name):
                self.assertNotEqual(web.runtime_digest(web.runtime_files(self.dist)), self.digest)
            path.write_bytes(original)
        (self.dist / 'assets/audio-worker.js').write_text('self.onmessage = () => {};')
        self.assertNotEqual(web.runtime_digest(web.runtime_files(self.dist)), self.digest)

    def test_reordered_enumeration_does_not_change_identity_but_deletion_does(self):
        files = web.runtime_files(self.dist)
        self.assertEqual(web.runtime_digest(files), web.runtime_digest(list(reversed(files))))
        (self.dist / 'assets/game.css').unlink()
        self.assertNotEqual(web.runtime_digest(web.runtime_files(self.dist)), self.digest)

    def test_public_directory_rejects_rom_git_symlink_and_unexpected_payload(self):
        for name in ('game.zip', 'game.rom', 'native', '.env.local', '.git/config', 'source/private.tar.gz'):
            path = self.dist / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'private payload')
            with self.subTest(name=name), self.assertRaises(ValueError):
                web.runtime_files(self.dist)
            path.unlink()
            if name.startswith(('.git/', 'source/')):
                path.parent.rmdir()
        (self.dist / 'assets/link.js').symlink_to(self.dist / 'assets/game.js')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            web.runtime_files(self.dist)

    def test_notice_links_use_exact_curated_source_without_copying_private_or_unlinked_files(self):
        (self.root / 'docs/licenses').mkdir(parents=True)
        notice = self.root / 'THIRD_PARTY_NOTICES.md'
        notice.write_text('[Assessment](docs/assessment.md)\n[Notices](docs/licenses/)\n')
        assessment = self.root / 'docs/assessment.md'
        assessment.write_text('[Inventory](../tests/inventory.json)\n[License](licenses/license.txt)\n')
        inventory = self.root / 'tests/inventory.json'
        inventory.write_text('{"component":"public"}\n')
        license_file = self.root / 'docs/licenses/license.txt'
        license_file.write_bytes(b'Original license bytes\r\n')
        unlinked = self.root / 'docs/licenses/unlinked.txt'
        unlinked.write_text('Included in complete source, not linked as support')
        private = self.root / '.env'
        private.write_text('Private fixture bytes')
        allowed = [notice, assessment, inventory, license_file, unlinked]
        output = self.root / 'build/support'
        web.copy_notice_supporting_files(self.root, output, allowed, 'source/source.tar.gz')
        for path in (notice, assessment, inventory, license_file):
            self.assertEqual((output / 'notices' / path.relative_to(self.root)).read_bytes(), path.read_bytes())
        self.assertFalse((output / 'notices/docs/licenses/unlinked.txt').exists())
        index = (output / 'notices/docs/licenses/index.html').read_text()
        self.assertIn('matching complete source', index)
        self.assertIn('license.txt', index)
        self.assertNotIn('unlinked.txt', index)
        notice.write_text('[Private](.env)')
        with self.assertRaisesRegex(ValueError, 'outside curated source'):
            web.copy_notice_supporting_files(self.root, output, allowed, 'source/source.tar.gz')
        self.assertFalse((output / 'notices/.env').exists())
        notice.write_text('[Outside](../outside.txt)')
        with self.assertRaisesRegex(ValueError, 'escapes source'):
            web.copy_notice_supporting_files(self.root, output, allowed, 'source/source.tar.gz')

    def test_baseline_with_pending_desktop_acceptance_and_deferred_device_gate_passes(self):
        self.assertEqual(web.verify_readiness(self.root, '0.2.0'), self.readiness)

    def test_passed_desktop_acceptance_names_actual_browsers_games_and_evidence(self):
        self.readiness['desktop_acceptance'].update(
            status='passed', games=['pong'], evidence='build/evidence/report.json', runtime_sha256=self.digest,
            browsers=[{'name': 'Chromium', 'version': '145.0.7632.6'}])
        self.write_readiness()
        self.assertEqual(web.verify_readiness(self.root, '0.2.0'), self.readiness)
        self.assertEqual(web.verify_readiness(self.root, '0.2.0', self.digest), self.readiness)
        original = copy.deepcopy(self.readiness)
        changes = [
            lambda value: value.update(browsers=[]),
            lambda value: value.update(browsers=[{'name': 'Chromium', 'version': ''}]),
            lambda value: value.update(browsers=['Chromium']),
            lambda value: value.update(games=[]),
            lambda value: value.update(evidence=None),
            lambda value: value.pop('runtime_sha256'),
            lambda value: value.update(runtime_sha256='not-a-digest'),
        ]
        for change in changes:
            self.readiness = copy.deepcopy(original)
            change(self.readiness['desktop_acceptance'])
            self.write_readiness()
            with self.subTest(change=change), self.assertRaises(ValueError):
                web.verify_readiness(self.root, '0.2.0', self.digest)

    def test_passed_desktop_acceptance_must_match_the_packaged_runtime(self):
        self.readiness['desktop_acceptance'].update(
            status='passed', games=['pong'], evidence='build/evidence/report.json', runtime_sha256=self.digest,
            browsers=[{'name': 'Firefox', 'version': '140.0'}])
        self.write_readiness()
        (self.dist / 'assets/game.js').write_text('const paddle = 2;')
        changed = web.runtime_digest(web.runtime_files(self.dist))
        self.assertNotEqual(changed, self.digest)
        with self.assertRaisesRegex(ValueError, 'packaged browser runtime'):
            web.verify_readiness(self.root, '0.2.0', changed)

    def test_blocked_inconsistent_or_device_gated_readiness_rejected(self):
        changes = [
            lambda value: value.update(release_ready=False),
            lambda value: value.update(blockers=['Desktop checks pending']),
            lambda value: value.update(schema_version=1),
            lambda value: value.update(version='0.1.0'),
            lambda value: value.update(release_scope=''),
            lambda value: value.pop('release_scope'),
            lambda value: value.pop('physical_device_gate'),
            lambda value: value['physical_device_gate'].update(status='required'),
            lambda value: value['physical_device_gate'].update(basis=''),
            lambda value: value.pop('desktop_acceptance'),
            lambda value: value['desktop_acceptance'].update(status='accepted'),
            lambda value: value['desktop_acceptance'].update(scope=''),
            lambda value: value['desktop_acceptance'].update(browsers=[{'name': 'Firefox', 'version': '140'}]),
        ]
        original = copy.deepcopy(self.readiness)
        for change in changes:
            self.readiness = copy.deepcopy(original)
            change(self.readiness)
            self.write_readiness()
            with self.subTest(change=change), self.assertRaises(ValueError):
                web.verify_readiness(self.root, '0.2.0')

    def test_preview_checks_record_without_requiring_release_ready(self):
        self.readiness.update(release_ready=False, blockers=['Desktop checks pending'])
        self.write_readiness()
        self.assertFalse(web.verify_readiness(self.root, '0.2.0', require_ready=False)['release_ready'])
        with self.assertRaisesRegex(ValueError, 'blocked by the release readiness'):
            web.verify_readiness(self.root, '0.2.0')
        self.readiness.update(release_ready=True)
        self.write_readiness()
        with self.assertRaisesRegex(ValueError, 'ready while blockers'):
            web.verify_readiness(self.root, '0.2.0', require_ready=False)

    def prepare_provenance_fixture(self):
        for directory in ('core', 'upstream'):
            shutil.copytree(ROOT / directory, self.root / directory)
        (self.root / 'tools').mkdir(exist_ok=True)
        for filename in ('prepare-core.py', 'build-core.sh', 'render-icons.mjs'):
            shutil.copyfile(ROOT / 'tools' / filename, self.root / 'tools' / filename)
        shutil.copyfile(ROOT / 'tests/source-manifest.json', self.root / 'tests/source-manifest.json')
        for name in ('VERSION', 'tsconfig.json', 'vite.config.ts'):
            (self.root / name).write_text('fixture input ' + name)
        for name in ('package.json', 'package-lock.json', web.FFLATE_MANIFEST,
                     'tests/fixtures/game-manifest.json', 'docs/licenses/fflate-0.8.2-LICENSE.txt'):
            destination = self.root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, destination)
        shutil.copytree(ROOT / 'node_modules/fflate', self.root / 'node_modules/fflate')
        (self.root / 'web/src').mkdir(parents=True)
        (self.root / 'web/public').mkdir()
        (self.root / 'web/index.html').write_text('frontend fixture source')
        (self.root / 'web/src/main.ts').write_text('let input = 1;')
        prepared = self.root / 'build/core/source'
        subprocess.run(['python3', str(self.root / 'tools/prepare-core.py'), '--output', str(prepared)], check=True, stdout=subprocess.DEVNULL)
        core_inputs = ['core/nocpu.h', 'core/api.cpp', 'core/port_hooks.h', 'tools/prepare-core.py', 'tools/build-core.sh',
                       'VERSION', 'tests/source-manifest.json']
        core_inputs += [p.relative_to(self.root).as_posix() for p in (self.root / 'core/platform').rglob('*') if p.is_file()]
        core_inputs += [p.relative_to(self.root).as_posix() for p in prepared.rglob('*') if p.is_file()]
        core = {'target': 'wasm', 'inputs': {name: web.sha256(self.root / name) for name in core_inputs},
                'outputs': {name: web.sha256(self.dist / 'core' / name) for name in ('nocpu.js', 'nocpu.wasm')}}
        (self.root / 'build/core/wasm').mkdir()
        (self.root / 'build/core/wasm/build-provenance.json').write_text(json.dumps(core))
        frontend_inputs = ['VERSION', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'web/index.html', 'web/src/main.ts', 'tools/render-icons.mjs']
        frontend_inputs += sorted(web.verify_frontend_dependency(self.root))
        frontend = {'schema_version': 1, 'base': '/NoCPU/', 'inputs': {name: web.sha256(self.root / name) for name in frontend_inputs},
                    'outputs': {entry['path']: entry['sha256'] for entry in web.runtime_files(self.dist)},
                    'core': {'core/' + name: web.sha256(self.dist / 'core' / name) for name in ('nocpu.js', 'nocpu.wasm')}}
        (self.root / 'build/web-provenance.json').write_text(json.dumps(frontend))
        return core, frontend

    def test_unique_verification_preserves_existing_history(self):
        self.prepare_provenance_fixture()
        historical = self.root / 'build/package-source-verification/source'
        historical.mkdir(parents=True)
        sentinel = historical / 'retained-history.txt'
        sentinel.write_text('retain these historical bytes')
        isolated = self.root / 'build/candidate/pages-source-verification/source'
        web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist), verification_dir=isolated)
        self.assertEqual(sentinel.read_text(), 'retain these historical bytes')
        self.assertTrue((isolated / 'chip.cpp').is_file())
        with self.assertRaises(ValueError):
            web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist), verification_dir=self.root / 'outside-build')

    def test_icon_recipe_is_required_and_changes_after_build_are_rejected(self):
        _, frontend = self.prepare_provenance_fixture()
        files = web.runtime_files(self.dist)
        web.verify_build_provenance(self.root, self.dist, files)
        recipe = self.root / 'tools/render-icons.mjs'
        original = recipe.read_bytes()
        provenance = self.root / 'build/web-provenance.json'
        for fault in ('unrecorded', 'changed', 'missing'):
            with self.subTest(fault=fault):
                altered = copy.deepcopy(frontend)
                if fault == 'unrecorded':
                    altered['inputs'].pop('tools/render-icons.mjs')
                elif fault == 'changed':
                    recipe.write_bytes(original + b'\n// Change made after the frontend build.\n')
                else:
                    recipe.unlink()
                provenance.write_text(json.dumps(altered))
                try:
                    expected = 'omits required source inputs' if fault == 'unrecorded' else 'Stale frontend build source input'
                    with self.assertRaisesRegex(ValueError, expected):
                        web.verify_build_provenance(self.root, self.dist, files)
                finally:
                    recipe.write_bytes(original)
                    provenance.write_text(json.dumps(frontend))

    def test_install_icon_check_rejects_missing_and_stale_valid_png_without_writing(self):
        public = self.root / 'web/public'
        public.mkdir(parents=True)
        shutil.copyfile(ROOT / 'web/public/icon.svg', public / 'icon.svg')
        shutil.copytree(ROOT / 'web/public/icons', public / 'icons')
        (self.root / 'tools').mkdir()
        recipe = self.root / 'tools/render-icons.mjs'
        shutil.copyfile(ROOT / 'tools/render-icons.mjs', recipe)

        def files():
            return {path.relative_to(public).as_posix(): web.sha256(path)
                    for path in public.rglob('*') if path.is_file()}

        def check():
            before = files()
            result = subprocess.run(['node', str(recipe), '--check'], cwd=self.root,
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(files(), before, '--check must preserve every source/icon byte even on failure')
            return result

        self.assertEqual(check().returncode, 0)
        png = public / 'icons/apple-touch-icon.png'
        original = png.read_bytes()
        png.unlink()
        self.assertNotEqual(check().returncode, 0)
        png.write_bytes(original)

        # Keep a genuine 180x180 opaque PNG, but change one pixel. This tests
        # stale generated content rather than an invalid container signature.
        position, header, compressed = 8, None, b''
        while position < len(original):
            size = struct.unpack('>I', original[position:position + 4])[0]
            name = original[position + 4:position + 8]
            data = original[position + 8:position + 8 + size]
            if name == b'IHDR':
                header = data
            elif name == b'IDAT':
                compressed += data
            position += size + 12
        self.assertEqual(struct.unpack('>IIBBBBB', header), (180, 180, 8, 2, 0, 0, 0))
        pixels = bytearray(zlib.decompress(compressed))
        pixels[1] ^= 1

        def chunk(name, data):
            return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)

        stale = original[:8] + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
        png.write_bytes(stale)
        result = check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('does not match its retained source recipe', result.stderr)
        png.write_bytes(original)
        svg = public / 'icon.svg'
        source = svg.read_text()
        edited = source.replace('#edf3f5', '#ff0000')
        self.assertNotEqual(edited, source)
        svg.write_text(edited)
        self.assertNotEqual(check().returncode, 0, 'A source mark edit must invalidate its old valid PNGs')

    def test_catalog_and_every_audited_dependency_input_are_required_in_provenance(self):
        _, frontend = self.prepare_provenance_fixture()
        files = web.runtime_files(self.dist)
        web.verify_build_provenance(self.root, self.dist, files)
        required = web.verify_frontend_dependency(self.root)
        self.assertIn('tests/fixtures/game-manifest.json', required)
        self.assertIn('node_modules/fflate/esm/browser.js', required)
        self.assertIn('upstream/fflate-0.8.2/src/index.ts', required)
        for name in required:
            omitted = copy.deepcopy(frontend)
            omitted['inputs'].pop(name)
            (self.root / 'build/web-provenance.json').write_text(json.dumps(omitted))
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'omits required source inputs'):
                web.verify_build_provenance(self.root, self.dist, files)

    def test_dependency_tampering_cannot_be_relabelled_by_refreshing_provenance(self):
        _, frontend = self.prepare_provenance_fixture()
        manifest = json.loads((self.root / web.FFLATE_MANIFEST).read_text())
        names = [web.FFLATE_MANIFEST, manifest['notice'], *manifest['runtime_inputs'], *manifest['source_files']]
        for name in names:
            path = self.root / name
            original = path.read_bytes()
            path.write_bytes(original + (b'\n ' if name.endswith('.json') else b'\nchanged'))
            forged = copy.deepcopy(frontend)
            forged['inputs'][name] = web.sha256(path)
            (self.root / 'build/web-provenance.json').write_text(json.dumps(forged))
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'fflate'):
                web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist))
            path.write_bytes(original)

    def test_catalog_changed_after_build_and_dependency_symlink_are_rejected(self):
        self.prepare_provenance_fixture()
        catalog = self.root / 'tests/fixtures/game-manifest.json'
        original = catalog.read_bytes()
        catalog.write_bytes(original + b'\n')
        with self.assertRaisesRegex(ValueError, 'Stale frontend build source input'):
            web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist))
        catalog.write_bytes(original)
        runtime = self.root / 'node_modules/fflate/esm/browser.js'
        saved = runtime.with_suffix('.saved')
        runtime.rename(saved)
        runtime.symlink_to(saved)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            web.verify_frontend_dependency(self.root)

    def test_dependency_version_and_lock_integrity_drift_are_rejected(self):
        self.prepare_provenance_fixture()
        for name in ('package.json', 'package-lock.json'):
            path = self.root / name
            original = path.read_bytes()
            document = json.loads(original)
            if name == 'package.json':
                document['dependencies']['fflate'] = '^0.8.2'
            else:
                document['packages']['node_modules/fflate']['integrity'] = 'sha512-unreviewed'
            path.write_text(json.dumps(document))
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'audited 0.8.2 pin'):
                web.verify_frontend_dependency(self.root)
            path.write_bytes(original)

    def test_stale_compiled_source_frontend_assets_and_prepared_adapters_rejected(self):
        self.prepare_provenance_fixture()
        files = web.runtime_files(self.dist)
        web.verify_build_provenance(self.root, self.dist, files)
        for name in ('core/api.cpp', 'core/platform/portable_video.inc', 'web/src/main.ts', 'vite.config.ts'):
            path = self.root / name
            original = path.read_bytes()
            path.write_bytes(original + b'\n// meaningful changed source')
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Stale .* source input'):
                web.verify_build_provenance(self.root, self.dist, files)
            path.write_bytes(original)
        (self.dist / 'assets/game.js').write_text('Changed runtime output after compilation')
        with self.assertRaisesRegex(ValueError, 'Stale or modified Vite output'):
            web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist))

    def test_root_site_bundle_cannot_be_published_at_project_pages_path(self):
        _, frontend = self.prepare_provenance_fixture()
        frontend['base'] = '/'
        (self.root / 'build/web-provenance.json').write_text(json.dumps(frontend))
        with self.assertRaisesRegex(ValueError, 'project Pages path'):
            web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist))

    def test_missing_source_provenance_or_false_derived_source_hash_rejected(self):
        core, _ = self.prepare_provenance_fixture()
        path = self.root / 'build/core/wasm/build-provenance.json'
        omitted = copy.deepcopy(core)
        omitted['inputs'].pop('core/api.cpp')
        path.write_text(json.dumps(omitted))
        with self.assertRaisesRegex(ValueError, 'omits required source'):
            web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist))
        core['inputs']['build/core/source/chip.cpp'] = '0' * 64
        path.write_text(json.dumps(core))
        with self.assertRaisesRegex(ValueError, 'freshly prepared corresponding source'):
            web.verify_build_provenance(self.root, self.dist, web.runtime_files(self.dist))

    def test_browser_license_notices_cannot_be_omitted_tampered_or_waived(self):
        version = (ROOT / 'VERSION').read_text().strip()
        audit = json.loads((ROOT / 'tests/browser-license-audit.json').read_text())
        audit.update(release_ready=True, blockers=[])
        shutil.copyfile(ROOT / 'tests/license-audit.json', self.root / 'tests/license-audit.json')
        for notice in audit['notices']:
            destination = self.root / notice['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / notice['path'], destination)
        path = self.root / 'tests/browser-license-audit.json'
        path.write_text(json.dumps(audit))
        self.assertEqual(web.verify_browser_license(self.root, version), audit['notices'])
        with self.assertRaisesRegex(ValueError, 'schema/version mismatch'):
            web.verify_browser_license(self.root, '0.0.0')
        omitted = copy.deepcopy(audit)
        omitted['notices'] = [entry for entry in omitted['notices'] if entry['path'] != 'docs/licenses/Emscripten-3.1.74-LICENSE.txt']
        path.write_text(json.dumps(omitted))
        with self.assertRaisesRegex(ValueError, 'omits required'):
            web.verify_browser_license(self.root, version)
        path.write_text(json.dumps(audit))
        (self.root / 'docs/licenses/Emscripten-3.1.74-LICENSE.txt').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'Missing or changed'):
            web.verify_browser_license(self.root, version)
        audit['release_ready'] = False
        path.write_text(json.dumps(audit))
        with self.assertRaisesRegex(ValueError, 'blocked by license'):
            web.verify_browser_license(self.root, version)


if __name__ == '__main__':
    unittest.main(verbosity=2)
