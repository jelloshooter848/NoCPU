#!/usr/bin/env python3
"""Release metadata checks for VERSION and CHANGELOG.md (Python 3.10+). See docs/RELEASING.md.

  python3 tools/release_check.py                       VERSION is SemVer; CHANGELOG.md has ## [Unreleased]
  python3 tools/release_check.py --tag v0.2.0          ...and the tag is v + VERSION, with a dated
                                                       ## [0.2.0] - YYYY-MM-DD section
  python3 tools/release_check.py --tag v0.2.0 --notes  ...and print that section's body (the release notes)

--version-file and --changelog read other files. Only the standard library is used, so
tools/check.py and the packaging tools can import this module.
"""

from __future__ import annotations

import argparse
import datetime
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# SemVer 2.0.0 (https://semver.org) without a leading "v"; pre-release (-rc.1) and build metadata allowed.
_IDENT = r"(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
SEMVER = re.compile(
    r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    rf"(?:-({_IDENT}(?:\.{_IDENT})*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
)
UNRELEASED = re.compile(r"^## \[Unreleased\][ \t]*$", re.MULTILINE)
FOOTER = re.compile(r"^\[[^\]]+\]: \S+\s*$")


def is_semver(version: object) -> bool:
    return isinstance(version, str) and SEMVER.fullmatch(version) is not None


def has_unreleased(changelog: str) -> bool:
    return UNRELEASED.search(changelog) is not None


def _section_body(lines: list[str], start: int) -> str:
    end = start + 1
    while end < len(lines) and not lines[end].startswith("## "):
        end += 1
    body = lines[start + 1:end]
    # Link reference footers ([0.1.0]: https://...) after the last section are not release notes.
    while body and (not body[-1].strip() or FOOTER.match(body[-1])):
        body.pop()
    return "\n".join(body).strip()


def find_section(changelog: str, version: str) -> tuple[str, str] | None:
    """Return (date, body) of the `## [version] - YYYY-MM-DD` section, or None."""
    lines = changelog.replace("\r\n", "\n").split("\n")
    heading = re.compile(rf"^## \[{re.escape(version)}\] - (\d{{4}}-\d{{2}}-\d{{2}})[ \t]*$")
    for index, line in enumerate(lines):
        match = heading.match(line)
        if match:
            return match.group(1), _section_body(lines, index)
    return None


def unreleased_notes(changelog: str) -> str:
    """Body of `## [Unreleased]` (empty when absent or empty)."""
    lines = changelog.replace("\r\n", "\n").split("\n")
    for index, line in enumerate(lines):
        if UNRELEASED.match(line):
            return _section_body(lines, index)
    return ""


def _is_real_date(value: str) -> bool:
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def check_release(version: object, changelog: str, tag: str | None = None) -> tuple[list[str], str | None]:
    """All checks: the problems found (empty when fine) and, with a tag, the release notes."""
    errors: list[str] = []
    notes = None
    if not is_semver(version):
        errors.append(f"VERSION {version!r} is not a SemVer version (x.y.z or x.y.z-rc.n).")
    unreleased = UNRELEASED.findall(changelog)
    if not unreleased:
        errors.append('CHANGELOG.md has no "## [Unreleased]" section.')
    elif len(unreleased) > 1:
        errors.append('CHANGELOG.md has more than one "## [Unreleased]" section.')
    else:
        first = re.search(r"^## ", changelog, re.MULTILINE)
        if first and not UNRELEASED.match(changelog, first.start()):
            errors.append('"## [Unreleased]" must be the first version section in CHANGELOG.md.')
    if tag is not None:
        if not tag.startswith("v") or not is_semver(tag[1:]):
            errors.append(f"Tag {tag!r} is not v followed by a SemVer version (for example v0.2.0).")
        elif is_semver(version) and tag != f"v{version}":
            errors.append(f"Tag {tag!r} does not match VERSION {version} (expected v{version}).")
        target = tag[1:] if tag.startswith("v") else tag
        section = find_section(changelog, target)
        if section is None:
            errors.append(f'CHANGELOG.md has no "## [{target}] - YYYY-MM-DD" section.')
        elif not _is_real_date(section[0]):
            errors.append(f"CHANGELOG.md section [{target}] has an invalid date {section[0]}.")
        elif not section[1]:
            errors.append(f"CHANGELOG.md section [{target}] is empty.")
        else:
            notes = section[1]
    return errors, notes


def check_files(version_file: Path, changelog_file: Path, tag: str | None = None) -> tuple[list[str], str | None]:
    try:
        version = version_file.read_text().strip()
        changelog = changelog_file.read_text()
    except OSError as exc:
        return [f"Cannot read release metadata: {exc}"], None
    return check_release(version, changelog, tag)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check VERSION, CHANGELOG.md and an optional release tag.")
    parser.add_argument("--tag", help="Release tag to check, exactly v + VERSION (for example v0.2.0)")
    parser.add_argument("--notes", action="store_true", help="Print the tag's changelog section (needs --tag)")
    parser.add_argument("--version-file", type=Path, default=ROOT / "VERSION")
    parser.add_argument("--changelog", type=Path, default=ROOT / "CHANGELOG.md")
    args = parser.parse_args(argv)
    if args.notes and args.tag is None:
        parser.error("--notes needs --tag")
    errors, notes = check_files(args.version_file, args.changelog, args.tag)
    if errors:
        print("Release check failed:\n" + "\n".join(f"- {error}" for error in errors), file=sys.stderr)
        return 1
    if args.notes:
        sys.stdout.write(f"{notes}\n")
    else:
        version = args.version_file.read_text().strip()
        print(f"Release check passed: version {version}" + (f", tag {args.tag}" if args.tag else "") + ".")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
