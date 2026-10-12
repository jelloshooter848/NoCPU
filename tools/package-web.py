#!/usr/bin/env python3
"""Package tested Pong browser assets with matching source and distribution notices."""
from __future__ import annotations

import argparse
import gzip
import html
import io
import tarfile
import zipfile
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_SUFFIXES = {'.html', '.js', '.mjs', '.css', '.wasm', '.svg', '.png', '.ico', '.webmanifest', '.json'}
RESERVED_NAMES = {'BUILD-MANIFEST.json', '.git', '.env'}
REQUIRED_CHECKS = {
    'coin_starts_play', 'independent_simultaneous_touch_paddles', 'ball_contacts_and_scoring',
    'audible_circuit_sound', 'pause_resume_and_reset', 'mute_unmute_and_audio_recovery',
    'portrait_landscape_layout', 'touch_cancel_and_background_recovery',
}
BASE_NOTICES = {'LICENSE', 'THIRD_PARTY_NOTICES.md'}
COMPILED_NOTICES = {
    'docs/licenses/Emscripten-3.1.74-AUTHORS.txt', 'docs/licenses/Emscripten-3.1.74-LICENSE.txt',
    'docs/licenses/LLVM-compiler-rt-3.1.74-CREDITS.txt', 'docs/licenses/LLVM-compiler-rt-3.1.74-LICENSE.txt',
    'docs/licenses/LLVM-libcxx-3.1.74-CREDITS.txt', 'docs/licenses/LLVM-libcxx-3.1.74-LICENSE.txt',
    'docs/licenses/LLVM-libcxxabi-3.1.74-CREDITS.txt', 'docs/licenses/LLVM-libcxxabi-3.1.74-LICENSE.txt',
    'docs/licenses/musl-emscripten-3.1.74-COPYRIGHT.txt', 'docs/licenses/Vite-7.3.1-LICENSE.md',
    'docs/licenses/Emscripten-3.1.74-RUNTIME-NOTICES.txt', 'docs/licenses/dlmalloc-2.8.6-NOTICE.txt',
    'docs/licenses/fflate-0.8.2-LICENSE.txt',
}
FFLATE_MANIFEST = 'tests/fflate-source-manifest.json'
FFLATE_MANIFEST_SHA256 = 'f810cb2233b207513e8f012e9085bd822b5f4557c647d2d9e0a6c3eab1d08fc7'
FFLATE_INTEGRITY = 'sha512-cPJU47OaAoCbg0pBvzsgpTPhmhqI5eJjh/JIu8tPj5q+T7iLvW/JAYUqmE7KOB4R1ZyEhzBaIQpQpardBF5z8A=='


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_source_packager():
    spec = importlib.util.spec_from_file_location('source_packager', ROOT / 'tools/package-release.py')
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def safe_relative(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or path.as_posix() != name:
        raise ValueError(f'Unsafe artifact path: {name!r}')
    return path


def runtime_files(directory: Path) -> list[dict]:
    """Digest every file emitted by Vite before adding packaging metadata/source/notices."""
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('Browser distribution must be a real directory')
    files = []
    for path in sorted(directory.rglob('*')):
        relative = path.relative_to(directory).as_posix()
        safe_relative(relative)
        if path.is_symlink():
            raise ValueError(f'Browser distribution symlink: {relative}')
        if any(part in RESERVED_NAMES or part.startswith('.env.') for part in path.relative_to(directory).parts):
            raise ValueError(f'Private or reserved browser payload: {relative}')
        if path.relative_to(directory).parts[0] in {'source', 'notices', 'provenance'}:
            raise ValueError(f'Reserved generated browser directory: {relative}')
        if not path.is_file():
            continue
        if path.suffix.lower() not in RUNTIME_SUFFIXES:
            raise ValueError(f'Unexpected browser payload: {relative}')
        if path.suffix.lower() == '.wasm' and path.read_bytes()[:8] != b'\x00asm\x01\x00\x00\x00':
            raise ValueError(f'Invalid Wasm module: {relative}')
        files.append({'path': relative, 'size': path.stat().st_size, 'sha256': sha256(path)})
    names = {entry['path'] for entry in files}
    missing = {'index.html', 'core/nocpu.js', 'core/nocpu.wasm'} - names
    if missing:
        raise ValueError('Missing browser runtime: ' + ', '.join(sorted(missing)))
    return files


def runtime_digest(files: list[dict]) -> str:
    payload = json.dumps(sorted(files, key=lambda entry: entry['path']), sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(payload).hexdigest()


def verify_frontend_dependency(root: Path) -> set[str]:
    """Bind the npm code Vite consumes to its audited preferred source/license."""
    def checked_path(name: str) -> Path:
        relative = safe_relative(name)
        path = root / name
        if any(root.joinpath(*relative.parts[:index]).is_symlink() for index in range(1, len(relative.parts) + 1)):
            raise ValueError(f'Frontend dependency input symlink: {name}')
        if not path.is_file():
            raise ValueError(f'Missing frontend dependency input: {name}')
        return path

    manifest_path = checked_path(FFLATE_MANIFEST)
    if sha256(manifest_path) != FFLATE_MANIFEST_SHA256:
        raise ValueError('Audited fflate source manifest changed')
    manifest = json.loads(manifest_path.read_text())
    package = json.loads(checked_path('package.json').read_text())
    lock = json.loads(checked_path('package-lock.json').read_text())
    installed = json.loads(checked_path('node_modules/fflate/package.json').read_text())
    locked = lock.get('packages', {}).get('node_modules/fflate', {})
    if (package.get('dependencies', {}).get('fflate') != '0.8.2'
        or lock.get('packages', {}).get('', {}).get('dependencies', {}).get('fflate') != '0.8.2'
        or locked.get('version') != '0.8.2' or locked.get('integrity') != FFLATE_INTEGRITY
        or installed.get('name') != 'fflate' or installed.get('version') != '0.8.2'):
        raise ValueError('fflate package, lock and installed runtime must match the audited 0.8.2 pin')
    required = {FFLATE_MANIFEST, 'tests/fixtures/game-manifest.json', manifest['notice'],
                manifest['preferred_source_directory'] + '/NOCPU_SOURCE.md'}
    for inputs in (manifest['source_files'], manifest['runtime_inputs']):
        for name, digest in inputs.items():
            if sha256(checked_path(name)) != digest:
                raise ValueError(f'Missing or changed fflate input: {name}')
            required.add(name)
    if sha256(checked_path(manifest['notice'])) != manifest['source_files'][manifest['preferred_source_directory'] + '/LICENSE']:
        raise ValueError('fflate notice must preserve the exact original license')
    for name in required:
        checked_path(name)
    return required


def verify_browser_license(root: Path, version: str, *, require_ready: bool = True) -> list[dict]:
    audit = json.loads((root / 'tests/browser-license-audit.json').read_text())
    if audit.get('schema_version') != 1 or audit.get('version') != version:
        raise ValueError('Browser license audit schema/version mismatch')
    if not isinstance(audit.get('release_ready'), bool) or not isinstance(audit.get('blockers'), list):
        raise ValueError('Invalid browser license readiness fields')
    if (audit['release_ready'] and audit['blockers']) or (require_ready and (not audit['release_ready'] or audit['blockers'])):
        raise ValueError('Browser distribution blocked by license audit')
    notices = audit.get('notices')
    if not isinstance(notices, list) or not notices:
        raise ValueError('Browser audit must list applicable license notices')
    seen = set()
    for entry in notices:
        name = entry.get('path', '')
        relative = safe_relative(name)
        if name in seen:
            raise ValueError(f'Duplicate browser notice: {name}')
        seen.add(name)
        if name not in BASE_NOTICES and not name.startswith('docs/licenses/') and not name.startswith('upstream/dice-0.9/'):
            raise ValueError(f'Unsupported browser notice location: {name}')
        path = root / name
        if any(root.joinpath(*relative.parts[:index]).is_symlink() for index in range(1, len(relative.parts) + 1)):
            raise ValueError(f'Browser notice symlink: {name}')
        if not path.is_file() or not re.fullmatch(r'[a-f0-9]{64}', entry.get('sha256', '')) or sha256(path) != entry['sha256']:
            raise ValueError(f'Missing or changed browser notice: {name}')
    source_audit = json.loads((root / 'tests/license-audit.json').read_text())
    required = BASE_NOTICES | COMPILED_NOTICES | {entry['path'] for entry in source_audit.get('notices', [])}
    if not required.issubset(seen):
        raise ValueError('Browser audit omits required component notices: ' + ', '.join(sorted(required - seen)))
    return notices


def verify_build_provenance(root: Path, directory: Path, files: list[dict], *, verification_dir: Path | None = None) -> tuple[dict, dict]:
    """Reject stale compiled assets before claiming they match the delivered source."""
    core = json.loads((root / 'build/core/wasm/build-provenance.json').read_text())
    frontend = json.loads((root / 'build/web-provenance.json').read_text())
    if core.get('target') != 'wasm' or frontend.get('schema_version') != 1:
        raise ValueError('Unsupported browser/core build provenance')
    if frontend.get('base') != '/NoCPU/':
        raise ValueError('Browser build base must match the project Pages path /NoCPU/')
    required_core = {'core/nocpu.h', 'core/api.cpp', 'core/port_hooks.h', 'tools/prepare-core.py',
                     'tools/build-core.sh', 'VERSION', 'tests/source-manifest.json'}
    required_core |= {path.relative_to(root).as_posix() for path in (root / 'core/platform').rglob('*') if path.is_file()}
    required_frontend = {'VERSION', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'web/index.html',
                         'tools/render-icons.mjs'}
    required_frontend |= verify_frontend_dependency(root)
    required_frontend |= {path.relative_to(root).as_posix() for path in (root / 'web/src').rglob('*') if path.is_file()}
    required_frontend |= {path.relative_to(root).as_posix() for path in (root / 'web/public').rglob('*')
                          if path.is_file() and not path.is_relative_to(root / 'web/public/core')}
    for label, provenance, required in (('core', core, required_core), ('frontend', frontend, required_frontend)):
        inputs = provenance.get('inputs')
        if not isinstance(inputs, dict) or not required.issubset(inputs):
            raise ValueError(f'{label} build provenance omits required source inputs')
        for name, digest in inputs.items():
            relative = safe_relative(name)
            if name.startswith('build/core/source/') and label == 'core':
                continue  # Compare against a freshly prepared source copy below.
            path = root / name
            if any(root.joinpath(*relative.parts[:index]).is_symlink() for index in range(1, len(relative.parts) + 1)):
                raise ValueError(f'{label} build input symlink: {name}')
            if not path.is_file() or sha256(path) != digest:
                raise ValueError(f'Stale {label} build source input: {name}')
    verification = verification_dir if verification_dir is not None else root / 'build/package-source-verification/source'
    build = (root / 'build').resolve()
    if not verification.resolve().is_relative_to(build) or verification.resolve() == build or verification.is_symlink():
        raise ValueError('Source verification must use a dedicated real directory under ignored build/')
    subprocess.run([sys.executable, str(root / 'tools/prepare-core.py'), '--output', str(verification)], cwd=root, check=True,
                   stdout=subprocess.DEVNULL)
    prepared = {'build/core/source/' + path.relative_to(verification).as_posix(): sha256(path)
                for path in verification.rglob('*') if path.is_file()}
    recorded = {name: digest for name, digest in core['inputs'].items() if name.startswith('build/core/source/')}
    if prepared != recorded:
        raise ValueError('Compiled core does not match freshly prepared corresponding source')
    outputs = {entry['path']: entry['sha256'] for entry in files}
    if frontend.get('outputs') != outputs:
        raise ValueError('Stale or modified Vite output does not match frontend build provenance')
    for name in ('nocpu.js', 'nocpu.wasm'):
        deployed = 'core/' + name
        if core.get('outputs', {}).get(name) != outputs.get(deployed) or frontend.get('core', {}).get(deployed) != outputs.get(deployed):
            raise ValueError(f'Stale core runtime output: {deployed}')
    return core, frontend


def finite_number(value, label: str, minimum: float = 0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < minimum:
        raise ValueError(f'Invalid physical-device measurement: {label}')
    return float(value)


def verify_readiness(root: Path, version: str, digest: str) -> dict:
    readiness = json.loads((root / 'tests/release-readiness.json').read_text())
    if readiness.get('schema_version') != 1 or readiness.get('version') != version:
        raise ValueError('Release readiness schema/version mismatch')
    if readiness.get('release_stage') != 'release' or readiness.get('release_ready') is not True or readiness.get('blockers') != []:
        raise ValueError('Final release blocked by physical-device readiness')
    if readiness.get('runtime_sha256') != digest:
        raise ValueError('Physical-device evidence does not match the complete browser runtime')
    if not REQUIRED_CHECKS.issubset(set(readiness.get('required_checks', []))):
        raise ValueError('Release readiness omits required physical-device checks')
    devices = readiness.get('devices')
    if not isinstance(devices, list):
        raise ValueError('Missing physical-device evidence')
    for platform in ('Android', 'iPhone'):
        matches = [device for device in devices if device.get('platform') == platform]
        if len(matches) != 1:
            raise ValueError(f'Exactly one qualified {platform} result is required')
        device = matches[0]
        if device.get('physical') is not True or device.get('status') != 'passed' or device.get('runtime_sha256') != digest:
            raise ValueError(f'Unqualified or stale physical {platform} result')
        for name in ('model', 'os_version', 'browser', 'browser_version', 'tested_at', 'build_id', 'evidence'):
            if not isinstance(device.get(name), str) or not device[name].strip():
                raise ValueError(f'Missing {platform} evidence field: {name}')
        accepted_browsers = {'chrome', 'google chrome'} if platform == 'Android' else {'safari', 'mobile safari'}
        if device['browser'].strip().casefold() not in accepted_browsers:
            raise ValueError(f'Required physical browser was not tested: {platform} ' + ('Chrome' if platform == 'Android' else 'Safari'))
        if any(device.get('checks', {}).get(name) is not True for name in REQUIRED_CHECKS):
            raise ValueError(f'Missing successful {platform} play/control/audio checks')
        performance = device.get('performance')
        if not isinstance(performance, dict):
            raise ValueError(f'Missing {platform} performance evidence')
        session = finite_number(performance.get('session_seconds'), 'session_seconds', 600)
        simulation = finite_number(performance.get('simulation_seconds'), 'simulation_seconds')
        wall = finite_number(performance.get('wall_seconds'), 'wall_seconds', 600)
        ratio = finite_number(performance.get('simulation_speed_ratio'), 'simulation_speed_ratio', 0.95)
        if abs(ratio - simulation / wall) > 0.01 or session < wall:
            raise ValueError(f'Inconsistent {platform} sustained performance evidence')
        for name in ('memory_start_bytes', 'memory_end_bytes', 'audio_underruns'):
            finite_number(performance.get(name), name)
        for name in ('frame_pacing', 'input_response'):
            if not isinstance(performance.get(name), str) or not performance[name].strip():
                raise ValueError(f'Missing {platform} measurement: {name}')
    return readiness


def source_identity(root: Path, final: bool, tag: str | None) -> tuple[str | None, str]:
    commit = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True, text=True)
    if commit.returncode:
        if final:
            raise ValueError('Final browser packaging requires its reviewed Git tag checkout')
        return None, 'source-archive'
    state = subprocess.run(['git', '-C', str(root), 'status', '--porcelain'], capture_output=True, text=True, check=True)
    dirty = bool(state.stdout.strip())
    if final:
        resolved = subprocess.run(['git', '-C', str(root), 'rev-parse', f'{tag}^{{commit}}'], capture_output=True, text=True)
        if dirty or resolved.returncode or resolved.stdout.strip() != commit.stdout.strip():
            raise ValueError('Final browser packaging requires a clean checkout of its exact release tag')
    return commit.stdout.strip(), 'dirty' if dirty else 'clean'


def copy_notice_supporting_files(root: Path, output_dir: Path, source_files: list[Path], source_path: str) -> None:
    """Preserve local notice links using only the already-audited source inventory."""
    root = root.resolve()
    allowed = {path.resolve() for path in source_files}
    pending = [root / 'THIRD_PARTY_NOTICES.md']
    copied: set[Path] = set()
    directories: set[Path] = set()
    while pending:
        path = pending.pop().resolve()
        if path in copied:
            continue
        if path not in allowed:
            raise ValueError(f'Notice support is outside curated source: {path}')
        copied.add(path)
        destination = output_dir / 'notices' / path.relative_to(root)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
        if path.suffix.lower() not in {'.md', '.txt'}:
            continue
        for link in re.findall(r'\]\(([^)]+)\)', path.read_text(errors='replace')):
            target = urlsplit(link.split(' ')[0].strip('<>'))
            if target.scheme or target.netloc or not target.path:
                continue
            linked = (path.parent / unquote(target.path)).resolve()
            if not linked.is_relative_to(root):
                raise ValueError(f'Notice supporting link escapes source: {link}')
            if linked.is_dir():
                if not any(candidate.is_relative_to(linked) for candidate in allowed):
                    raise ValueError(f'Notice supporting directory is outside curated source: {link}')
                directories.add(linked)
            elif linked in allowed:
                pending.append(linked)
            else:
                raise ValueError(f'Notice supporting link is outside curated source: {link}')
    # Directory links show the available supporting files and complete source
    # download; they do not imply that the entire original tree is deployed.
    for directory in sorted(directories):
        destination = output_dir / 'notices' / directory.relative_to(root)
        destination.mkdir(parents=True, exist_ok=True)
        download = quote(os.path.relpath(output_dir / source_path, destination))
        links = []
        for file in sorted(destination.iterdir()):
            if file.is_file():
                links.append(f'<li><a href="{html.escape(quote(file.name))}">{html.escape(file.name)}</a></li>')
        title = html.escape(directory.relative_to(root).as_posix())
        (destination / 'index.html').write_text(
            f'<!doctype html><html lang="en"><meta charset="utf-8"><title>{title}</title>'
            f'<h1>{title}</h1><p>Published supporting files are listed below. '
            f'<a href="{html.escape(download)}">Download the matching complete source</a> '
            f'for the full directory.</p><ul>{"".join(links)}</ul></html>\n')


def package_web(root: Path, browser_dir: Path, output_dir: Path, preview: bool, tag: str | None) -> dict:
    version = (root / 'VERSION').read_text().strip()
    source = load_source_packager()
    source.check_tag(version, tag, preview)
    source_audit = json.loads((root / 'tests/license-audit.json').read_text())
    if source_audit.get('release_ready') is not True or source_audit.get('blockers') != []:
        raise ValueError('Matching source blocked by source license audit')
    notices = verify_browser_license(root, version)
    build = (root / 'build').resolve()
    if not output_dir.resolve().is_relative_to(build) or output_dir.resolve() == build or output_dir.is_symlink():
        raise ValueError('Package output must be a dedicated real directory under ignored build/')
    if output_dir.resolve().is_relative_to(browser_dir.resolve()) or browser_dir.resolve().is_relative_to(output_dir.resolve()):
        raise ValueError('Package output and browser input must be separate non-overlapping directories')
    files = runtime_files(browser_dir)
    digest = runtime_digest(files)
    # Each package owns its verification copy as well as its output. Historical
    # verification trees and other producers' shared core copies stay intact.
    verification = output_dir.parent / (output_dir.name + '-source-verification') / 'source'
    core_provenance, frontend_provenance = verify_build_provenance(root, browser_dir, files, verification_dir=verification)
    readiness = json.loads((root / 'tests/release-readiness.json').read_text())
    if not preview:
        readiness = verify_readiness(root, version, digest)
        source.release_notes(root, version)  # A final build needs its dated changelog section.
    commit, tree_state = source_identity(root, not preview, tag)
    # Validate all source payloads before writing a publishable directory.
    source_files = source.collect_files(root)
    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(browser_dir, output_dir)
    source_path = 'source/nocpu-' + version + '-source.tar.gz'
    archive_digest = source.make_archive(root, output_dir / source_path, version, False,
        artifact_type='preview-corresponding-source' if preview else 'source-release', source_commit=commit)
    (output_dir / (source_path + '.sha256')).write_text(f'{archive_digest}  {Path(source_path).name}\n')
    for notice in notices:
        name = notice['path']
        destination = output_dir / 'notices' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, destination)
    copy_notice_supporting_files(root, output_dir, source_files, source_path)
    provenance_dir = output_dir / 'provenance'
    provenance_dir.mkdir()
    for name, provenance in (('core-build.json', core_provenance), ('web-build.json', frontend_provenance)):
        (provenance_dir / name).write_text(json.dumps(provenance, indent=2, sort_keys=True) + '\n')
    shutil.copyfile(root / 'tests/browser-license-audit.json', output_dir / 'notices/browser-license-audit.json')
    manifest = {
        'schema_version': 1, 'project': 'NoCPU', 'version': version,
        'stage': 'preview' if preview else 'release', 'tag': None if preview else tag,
        'buildId': commit or 'source', 'source_commit': commit, 'source_tree_state': tree_state,
        'runtime_sha256': digest, 'runtime_files': files,
        'source_archive': {'path': source_path, 'sha256': archive_digest},
        'license_assessment': 'notices/browser-license-audit.json',
        'physical_device_readiness': readiness,
        'files': [],
    }
    manifest['files'] = [
        {'path': path.relative_to(output_dir).as_posix(), 'size': path.stat().st_size, 'sha256': sha256(path)}
        for path in sorted(output_dir.rglob('*')) if path.is_file()
    ]
    (output_dir / 'BUILD-MANIFEST.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    return manifest


def write_site_zip(directory: Path, destination: Path) -> Path:
    """Zip the packaged site at its root (serve it from a /NoCPU/ folder) with fixed metadata."""
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(directory.rglob('*')):
            if path.is_symlink():
                raise ValueError('Generated web artifact may not contain symlinks')
            if not path.is_file():
                continue
            entry = zipfile.ZipInfo(path.relative_to(directory).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            entry.external_attr = 0o644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())
    (destination.parent / (destination.name + '.sha256')).write_text(f'{sha256(destination)}  {destination.name}\n')
    return destination


def make_web_archive(root: Path, directory: Path, output_dir: Path, manifest: dict) -> Path:
    build = (root / 'build').resolve()
    if not output_dir.resolve().is_relative_to(build) or output_dir.resolve() == build or output_dir.is_symlink():
        raise ValueError('Web archive output must be a dedicated directory under ignored build/')
    if output_dir.resolve().is_relative_to(directory.resolve()) or directory.resolve().is_relative_to(output_dir.resolve()):
        raise ValueError('Web archive output and packaged Pages directory must not overlap')
    output_dir.mkdir(parents=True, exist_ok=True)
    name = 'nocpu-' + manifest['version'] + ('-preview' if manifest['stage'] == 'preview' else '') + '-web.tar.gz'
    destination = output_dir / name
    with destination.open('wb') as output:
        with gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.GNU_FORMAT) as archive:
                for path in sorted(directory.rglob('*')):
                    if path.is_symlink():
                        raise ValueError('Generated web artifact may not contain symlinks')
                    if not path.is_file():
                        continue
                    payload = path.read_bytes()
                    entry = tarfile.TarInfo('nocpu-' + manifest['version'] + '/' + path.relative_to(directory).as_posix())
                    entry.size = len(payload)
                    entry.mode = 0o644
                    entry.mtime = entry.uid = entry.gid = 0
                    entry.uname = entry.gname = ''
                    archive.addfile(entry, io.BytesIO(payload))
    digest = sha256(destination)
    (output_dir / (name + '.sha256')).write_text(f'{digest}  {name}\n')
    write_site_zip(directory, output_dir / name.replace('.tar.gz', '.zip'))
    for suffix in ('', '.sha256'):
        source = directory / (manifest['source_archive']['path'] + suffix)
        shutil.copyfile(source, output_dir / source.name)
    source_packager = load_source_packager()
    (output_dir / 'RELEASE-NOTES.md').write_text(source_packager.release_notes(
        root, manifest['version'], unreleased_ok=manifest['stage'] == 'preview'))
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--preview', action='store_true')
    group.add_argument('--tag')
    parser.add_argument('--browser-dir', type=Path, default=ROOT / 'build/web')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'build/pages')
    parser.add_argument('--archive-dir', type=Path, help='Also create deterministic web/source release assets under build/')
    args = parser.parse_args()
    try:
        subprocess.run([sys.executable, str(ROOT / 'tools/check.py')], cwd=ROOT, check=True)
        manifest = package_web(ROOT, args.browser_dir.resolve(), args.output_dir.resolve(), args.preview, args.tag)
        if args.archive_dir:
            make_web_archive(ROOT, args.output_dir.resolve(), args.archive_dir.resolve(), manifest)
        print(f"Packaged {manifest['stage']} {manifest['version']}: {args.output_dir}\nRuntime SHA-256: {manifest['runtime_sha256']}")
        return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as exc:
        print(f'Browser packaging failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
