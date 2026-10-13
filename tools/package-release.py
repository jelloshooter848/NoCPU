#!/usr/bin/env python3
"""Create a deterministic, integrity-manifested source release or local candidate."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import io
import json
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = {".github", "core", "docs", "tests", "tools", "upstream", "web", "bug-reports"}
ROOT_FILES = {"README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CHANGELOG.md", "CONTRIBUTING.md", "AGENTS.md", "VERSION", ".gitignore", ".gitattributes", "Makefile", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "playwright.config.ts"}
SKIP_DIRS = {"__pycache__", ".cache", "node_modules", "playwright-report", "test-results"}
GENERATED_PATHS = {"web/public/core"}
def load_release_check():
    spec = importlib.util.spec_from_file_location("release_check", Path(__file__).resolve().parent / "release_check.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release_check = load_release_check()
DENIED_SUFFIXES = {".zip", ".rom", ".bin", ".7z", ".rar", ".gz", ".xz", ".bz2", ".tgz", ".tbz2", ".txz", ".exe", ".dll", ".so", ".dylib", ".o", ".a", ".wasm", ".pyc", ".pyo", ".pem", ".key"}


def collect_files(root: Path) -> list[Path]:
    result: list[Path] = []
    candidates = [root / name for name in ROOT_FILES if (root / name).exists()]
    for name in sorted(SOURCE_DIRS):
        directory = root / name
        if directory.is_symlink():
            raise ValueError(f"Source directory may not be a symlink: {name}")
        if directory.is_dir():
            candidates.extend(directory.rglob("*"))
    for path in candidates:
        relative = path.relative_to(root)
        if any(relative.as_posix() == name or relative.as_posix().startswith(name + "/") for name in GENERATED_PATHS):
            continue
        if ".git" in relative.parts:
            raise ValueError(f"Nested Git metadata is not allowed in source: {relative}")
        if any(part in SKIP_DIRS for part in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError(f"Source symlink is not allowed: {relative}")
        if not path.is_file():
            continue
        if path.suffix.lower() in DENIED_SUFFIXES or path.name.endswith((".tar", ".tar.gz")):
            raise ValueError(f"Non-source or private payload is not allowed: {relative}")
        if path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example") or any(part in {"roms", "private-roms"} for part in relative.parts):
            raise ValueError(f"Private source path is not allowed: {relative}")
        result.append(path)
    return sorted(result, key=lambda path: path.relative_to(root).as_posix())


def check_tag(version: str, tag: str | None, candidate: bool) -> None:
    if not release_check.is_semver(version):
        raise ValueError("Invalid VERSION")
    if candidate:
        if tag:
            raise ValueError("A local candidate must not be labeled as a release tag")
    elif tag != f"v{version}":
        raise ValueError(f"Release tag must match VERSION exactly: v{version}")


def release_notes(root: Path, version: str, *, unreleased_ok: bool = False) -> str:
    """The dated `## [version] - YYYY-MM-DD` changelog section, heading included.

    A local candidate or untagged build may instead carry the `## [Unreleased]` entries.
    """
    changelog = (root / "CHANGELOG.md").read_text()
    section = release_check.find_section(changelog, version)
    if section is not None:
        date, body = section
        return f"## [{version}] - {date}\n\n{body}\n"
    if unreleased_ok:
        return f"## [Unreleased] (untagged {version} build)\n\n{release_check.unreleased_notes(changelog)}\n"
    raise ValueError(f"Finalize the changelog: CHANGELOG.md lacks a dated ## [{version}] - YYYY-MM-DD section")


def make_archive(root: Path, destination: Path, version: str, candidate: bool, *, artifact_type: str | None = None, source_commit: str | None = None) -> str:
    files = collect_files(root)
    snapshots = [(path.relative_to(root).as_posix(), path.read_bytes(), bool(path.stat().st_mode & 0o111)) for path in files]
    audit = json.loads((root / "tests/license-audit.json").read_text())
    source = json.loads((root / "tests/source-manifest.json").read_text())
    manifest = {
        "schema_version": 1, "project": "NoCPU", "version": version,
        "artifact_type": artifact_type or ("local-review-candidate" if candidate else "source-release"),
        "source_commit": source_commit,
        "license_release_ready": audit["release_ready"], "license_blockers": audit["blockers"],
        "license_assessment_scope": audit.get("assessment_scope", "Source-only distribution"),
        "combined_distribution_license": audit.get("combined_distribution_license"),
        "original_dice_license": audit.get("original_dice_license"),
        "original_source_archive_name": source.get("source_archive_name"),
        "original_source_archive_sha256": source["source_archive_sha256"],
        "files": [{"path": name, "sha256": hashlib.sha256(payload).hexdigest(), "size": len(payload)} for name, payload, _ in snapshots],
    }
    prefix = f"nocpu-{version}{'-candidate' if candidate else ''}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.GNU_FORMAT) as archive:
                entries = list(snapshots)
                entries.append(("RELEASE-MANIFEST.json", (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode(), False))
                for name, payload, executable in sorted(entries):
                    entry = tarfile.TarInfo(f"{prefix}/{name}")
                    entry.size = len(payload)
                    entry.mode = 0o755 if executable else 0o644
                    entry.mtime = entry.uid = entry.gid = 0
                    entry.uname = entry.gname = ""
                    archive.addfile(entry, io.BytesIO(payload))
    return hashlib.sha256(destination.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", action="store_true", help="Local review only; include unresolved license blockers in manifest")
    parser.add_argument("--tag", help="Publication tag, exactly v plus VERSION; required for release mode")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "build/release")
    args = parser.parse_args()
    try:
        version = (ROOT / "VERSION").read_text().strip()
        check_tag(version, args.tag, args.candidate)
        subprocess.run([sys.executable, str(ROOT / "tools/check.py")], cwd=ROOT, check=True)
        audit = json.loads((ROOT / "tests/license-audit.json").read_text())
        if not args.candidate and (not audit["release_ready"] or audit["blockers"]):
            raise ValueError("Source release blocked by license audit: " + "; ".join(audit["blockers"]))
        notes = release_notes(ROOT, version, unreleased_ok=args.candidate)
        name = f"nocpu-{version}{'-candidate' if args.candidate else ''}-source.tar.gz"
        destination = args.output_dir.resolve() / name
        identity = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], capture_output=True, text=True, check=False)
        source_commit = identity.stdout.strip() if identity.returncode == 0 else None
        digest = make_archive(ROOT, destination, version, args.candidate, source_commit=source_commit)
        (destination.parent / f"{name}.sha256").write_text(f"{digest}  {name}\n")
        (destination.parent / "RELEASE-NOTES.md").write_text(notes)
        print(f"Created {'local candidate' if args.candidate else 'source release'}: {destination}\nSHA-256: {digest}")
        return 0
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(f"Packaging failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
