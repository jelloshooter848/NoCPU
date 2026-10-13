#!/usr/bin/env python3
"""ROM-free repository and immutable-source checks (Python 3.10+)."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_SUFFIXES = {".zip", ".rom", ".bin", ".7z", ".rar", ".gz", ".xz", ".bz2", ".tgz", ".tbz2", ".txz", ".exe", ".dll", ".so", ".dylib", ".o", ".a", ".wasm"}
IGNORED_DIRS = {"build", "dist", ".cache", "__pycache__", ".vscode", ".idea", "node_modules", "playwright-report", "test-results"}
GENERATED_PATHS = {"web/public/core"}
REQUIRED = (
    "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CHANGELOG.md", "CONTRIBUTING.md", "AGENTS.md",
    "VERSION", ".gitignore", ".gitattributes", "Makefile", "docs/PROVENANCE.md", "docs/ROADMAP.md", "docs/TESTING.md",
    "docs/RELEASING.md", "tools/release_check.py", "tests/source-manifest.json", "tests/license-audit.json",
    "tests/fixtures/game-manifest.json", "tools/audit-games.py", "tools/audit-roms.py",
    "tools/build-native.sh", "tools/capture-pong.sh", "tools/package-release.py",
    ".github/workflows/ci.yml", ".github/workflows/release.yml",
)


def load_release_check():
    """Import the VERSION/CHANGELOG rules shared with tools/release_check.py."""
    spec = importlib.util.spec_from_file_location("release_check", Path(__file__).resolve().parent / "release_check.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release_check = load_release_check()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source(root: Path) -> list[str]:
    """Check the manifest's complete path set, sizes, and bytes; never follow symlinks."""
    errors: list[str] = []
    manifest = json.loads((root / "tests/source-manifest.json").read_text())
    if manifest.get("schema_version") != 1 or manifest.get("root") != "upstream/dice-0.9":
        return ["Unsupported source manifest schema or root"]
    entries = manifest.get("files", [])
    if manifest.get("file_count") != len(entries) or len(entries) != 566:
        errors.append("Source manifest must describe the 566 original files")
    expected: dict[str, dict] = {}
    for entry in entries:
        name = entry.get("path", "")
        path = PurePosixPath(name)
        if not name or path.is_absolute() or ".." in path.parts or "\\" in name or path.as_posix() != name:
            errors.append(f"Unsafe source manifest path: {name!r}")
            continue
        if name in expected:
            errors.append(f"Duplicate source manifest path: {name}")
        if not re.fullmatch(r"[a-f0-9]{64}", entry.get("sha256", "")):
            errors.append(f"Invalid SHA-256 for {name}")
        expected[name] = entry
    source = root / manifest["root"]
    actual: set[str] = set()
    if source.is_symlink() or (root / "upstream").is_symlink():
        return errors + ["Immutable source root may not be a symlink"]
    for path in source.rglob("*"):
        name = path.relative_to(source).as_posix()
        if path.is_symlink():
            errors.append(f"Symlink in immutable source: {name}")
            continue
        if not path.is_file():
            continue
        actual.add(name)
        if name in expected:
            entry = expected[name]
            if path.stat().st_size != entry.get("size") or sha256(path) != entry["sha256"]:
                errors.append(f"Original source changed: {name}")
    errors.extend(f"Original source missing: {name}" for name in sorted(set(expected) - actual))
    errors.extend(f"Unexpected original-source file: {name}" for name in sorted(actual - set(expected)))
    license_file = source / "LICENSE.txt"
    if license_file.is_file() and (root / "LICENSE").is_file() and sha256(license_file) != sha256(root / "LICENSE"):
        errors.append("Root LICENSE differs from original DICE GPL text")
    return errors


def verify_payloads(root: Path) -> list[str]:
    """Catch local payloads and tracked files even when an ignore rule hides them."""
    errors: list[str] = []
    paths: set[Path] = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        base = Path(directory)
        retained = []
        for name in dirs:
            if name == ".git":
                if base != root:
                    errors.append(f"Nested Git metadata is not allowed: {(base / name).relative_to(root).as_posix()}")
                continue
            if name in IGNORED_DIRS:
                continue
            path = base / name
            if path.relative_to(root).as_posix() in GENERATED_PATHS:
                continue
            if path.is_symlink():
                errors.append(f"Repository symlink is not allowed: {path.relative_to(root).as_posix()}")
            else:
                retained.append(name)
        dirs[:] = retained
        for name in files:
            path = base / name
            relative = path.relative_to(root)
            if name == ".git":
                if base != root:
                    errors.append(f"Nested Git metadata is not allowed: {relative.as_posix()}")
                continue
            if path.is_symlink():
                errors.append(f"Repository symlink is not allowed: {relative.as_posix()}")
            else:
                paths.add(relative)
    # A generated path accidentally tracked in Git must not escape the public audit.
    result = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], capture_output=True, check=False)
    if result.returncode == 0:
        for name in result.stdout.decode().split("\0"):
            if name:
                relative = Path(name)
                if ".git" in relative.parts:
                    if relative != Path(".git"):
                        errors.append(f"Nested Git metadata is tracked: {name}")
                    continue
                paths.add(relative)
                if any(part in IGNORED_DIRS for part in relative.parts) or any(relative.as_posix() == path or relative.as_posix().startswith(path + "/") for path in GENERATED_PATHS):
                    errors.append(f"Generated or local-only path is tracked: {name}")
    for relative in sorted(paths):
        suffix = relative.suffix.lower()
        name = relative.name
        if suffix in FORBIDDEN_SUFFIXES or name.endswith((".tar", ".tar.gz")):
            errors.append(f"ROM/archive/build payload is not allowed in public source: {relative.as_posix()}")
        if name == ".env" or (name.startswith(".env.") and name != ".env.example") or suffix in {".pem", ".key"}:
            errors.append(f"Private configuration is not allowed in public source: {relative.as_posix()}")
        if any(part in {"roms", "private-roms"} for part in relative.parts):
            errors.append(f"Private ROM directory is not allowed in public source: {relative.as_posix()}")
    return errors


def verify_license_notices(root: Path) -> list[str]:
    audit = json.loads((root / "tests/license-audit.json").read_text())
    errors: list[str] = []
    if audit.get("schema_version") != 1 or not isinstance(audit.get("release_ready"), bool) or not isinstance(audit.get("blockers"), list):
        return ["Unsupported license audit schema"]
    if audit["release_ready"] and audit["blockers"]:
        errors.append("License audit cannot be ready while blockers remain")
    notices = audit.get("notices")
    if not isinstance(notices, list) or not notices:
        return errors + ["License audit must identify retained notices"]
    expected: set[str] = set()
    for notice in notices:
        name = notice.get("path", "")
        relative = PurePosixPath(name)
        if not name or relative.is_absolute() or ".." in relative.parts or "\\" in name or relative.as_posix() != name:
            errors.append(f"Unsafe license notice path: {name!r}")
            continue
        if name in expected:
            errors.append(f"Duplicate license notice path: {name}")
        expected.add(name)
        path = root / name
        ancestors = [root.joinpath(*relative.parts[:index]) for index in range(1, len(relative.parts) + 1)]
        if any(ancestor.is_symlink() for ancestor in ancestors):
            errors.append(f"License notice may not use a symlink: {name}")
            continue
        if not path.is_file():
            errors.append(f"Required license notice missing: {name}")
            continue
        if "sha256" in notice:
            digest = notice["sha256"]
            if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
                errors.append(f"Invalid license notice SHA-256: {name}")
            elif sha256(path) != digest:
                errors.append(f"License notice changed: {name}")
    required = {
        "LICENSE", "THIRD_PARTY_NOTICES.md", "upstream/dice-0.9/LICENSE.txt",
        "upstream/dice-0.9/manymouse/LICENSE.txt", "docs/licenses/puff-zlib.txt",
        "docs/licenses/Apple-HID-Utilities.txt",
    }
    errors.extend(f"Required license notice absent from audit: {name}" for name in sorted(required - expected))
    return errors


def verify_browser_metadata(root: Path, version: str) -> list[str]:
    """Allow honest pending license/desktop gates while checking notice integrity and the readiness record."""
    errors = []
    required = ('package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'playwright.config.ts',
                'tools/package-web.py', 'tools/build-core.sh', 'tests/browser-license-audit.json',
                'tests/release-readiness.json', '.github/workflows/verify-browser.yml')
    errors.extend(f'Required browser foundation missing: {name}' for name in required if not (root / name).is_file())
    if errors:
        return errors
    spec = importlib.util.spec_from_file_location('browser_release_checks', root / 'tools/package-web.py')
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        module.verify_browser_license(root, version, require_ready=False)
        module.verify_readiness(root, version, require_ready=False)
        package = json.loads((root / 'package.json').read_text())
        lock = json.loads((root / 'package-lock.json').read_text())
        if package.get('version') != version or lock.get('version') != version or lock.get('packages', {}).get('', {}).get('version') != version:
            errors.append('Node package and lock versions must match VERSION')
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f'Browser metadata check failed: {exc}')
    return errors


def main() -> int:
    version = ""
    errors = [f"Required repository file missing: {name}" for name in REQUIRED if not (ROOT / name).is_file()]
    if (ROOT / "VERSION").is_file() and (ROOT / "CHANGELOG.md").is_file():
        version = (ROOT / "VERSION").read_text().strip()
        release_errors, _ = release_check.check_release(version, (ROOT / "CHANGELOG.md").read_text())
        errors.extend(release_errors)
    try:
        errors.extend(verify_source(ROOT))
        errors.extend(verify_payloads(ROOT))
        errors.extend(verify_license_notices(ROOT))
        # The restarted desktop-first line ships a browser build from 0.1.0, so
        # browser metadata (which reports missing foundation files) always applies.
        if release_check.is_semver(version):
            errors.extend(verify_browser_metadata(ROOT, version))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f"Repository metadata check failed: {exc}")
    if errors:
        print("Repository checks failed:\n" + "\n".join(f"- {error}" for error in errors), file=sys.stderr)
        return 1
    for script in ("tools/audit-games.py", "tools/audit-roms.py"):
        result = subprocess.run([sys.executable, str(ROOT / script)], cwd=ROOT, check=False)
        if result.returncode:
            return result.returncode
    print("Repository checks passed: original source, version, public payloads, licensing metadata, and game/ROM metadata.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
