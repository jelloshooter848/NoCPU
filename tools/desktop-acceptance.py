#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Desktop acceptance record, generated from a verification run's own browser results.

The release readiness record (tests/release-readiness.json) states the policy:
the games and browser engines that must pass. This tool turns what the browser
jobs of one workflow run actually observed into `nocpu-X.Y.Z-acceptance.json`,
bound to the packaged runtime digest of the exact site those jobs tested.

  collect  one browser job: reduce its Playwright JSON report and the browser
           identity the run recorded to the game-tagged outcomes, with the
           runtime digest recomputed from the tested site.
  combine  every collected result plus the tested site and the policy: the
           acceptance record. Status is "passed" only when every required game
           passed in every required engine at the site's runtime digest.
  verify   the publish step: the record matches the release zip's runtime and
           tag, is internally consistent, and passed where the shipped policy
           requires it.

Game coverage comes from Playwright tags (`@game-<id>`) on the specs. A game
passes in an engine when at least one tagged test ran and every tagged test
passed (a test skipped in one run and passed in another, such as the ROM tests,
counts as passed; skipped everywhere does not), and no test in any of that
engine's runs failed. Playwright's engines are real Chromium, Firefox and
WebKit but Playwright's own builds; the record names them that way and never as
Chrome or a release Firefox.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECORD_SCHEMA = 1
RESULT_SCHEMA = 2
MISSING_KIND = 'nocpu-browser-results-missing'
ENGINES = ('chromium', 'firefox', 'webkit')
SOURCES = ('public', 'rom')
TAG_PREFIX = '@game-'
LIMITATIONS = [
    'Automated Playwright tests driving the packaged site with scripted keyboard, mouse and synthetic '
    'gamepad input in headless engines on a CI runner; not human play.',
    "Playwright's own builds of the Chromium, Firefox and WebKit engines; not Google Chrome, a Mozilla "
    'release Firefox or Safari.',
    'Audio is scheduled into a PulseAudio null sink: generated and played sound is checked, speaker '
    'output is not.',
    'Stunt Cycle, Indy 4, Anti-Aircraft, Shark Jaws, Jet Fighter and Attack play from private ROM '
    "fixtures in Chromium and Firefox only; all but Attack inherit DICE's absent audio.",
    'Browser behavior only: original/native/Wasm accuracy is the comparison record in docs/ACCEPTANCE.md.',
]


def load_packager():
    spec = importlib.util.spec_from_file_location('package_web', ROOT / 'tools/package-web.py')
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked_runtime(manifest: dict, read) -> str:
    """Recompute the runtime digest from the files themselves; never trust the manifest's value alone."""
    files = manifest.get('runtime_files')
    if not isinstance(files, list) or not files:
        raise ValueError('Build manifest lists no runtime files')
    for entry in files:
        data = read(entry['path'])
        if len(data) != entry['size'] or sha256(data) != entry['sha256']:
            raise ValueError(f"Packaged runtime file differs from its manifest: {entry['path']}")
    digest = load_packager().runtime_digest(files)
    if digest != manifest.get('runtime_sha256'):
        raise ValueError('Build manifest runtime_sha256 does not match its runtime files')
    return digest


def site_identity(site: Path) -> dict:
    manifest = json.loads((site / 'BUILD-MANIFEST.json').read_text())

    def read(name: str) -> bytes:
        path = (site / name).resolve()
        if not path.is_relative_to(site.resolve()) or not path.is_file():
            raise ValueError(f'Packaged runtime file missing: {name}')
        return path.read_bytes()
    return identity_from_manifest(manifest, checked_runtime(manifest, read))


def zip_identity(archive: Path) -> dict:
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read('BUILD-MANIFEST.json'))
        # The zip holds exactly the files the manifest lists (plus the manifest itself), byte for byte.
        names = bundle.namelist()
        listed = {entry['path']: entry for entry in manifest.get('files', [])}
        if len(names) != len(set(names)) or set(names) != set(listed) | {'BUILD-MANIFEST.json'}:
            extra = sorted(set(names) - set(listed) - {'BUILD-MANIFEST.json'})
            absent = sorted(set(listed) - set(names))
            raise ValueError(f'Release zip members differ from the manifest files list (extra {extra}, missing {absent})')
        for name, entry in listed.items():
            data = bundle.read(name)
            if len(data) != entry['size'] or sha256(data) != entry['sha256']:
                raise ValueError(f'Release zip member differs from the manifest: {name}')
        return identity_from_manifest(manifest, checked_runtime(manifest, bundle.read))


def identity_from_manifest(manifest: dict, digest: str) -> dict:
    return {
        'version': manifest.get('version'), 'stage': manifest.get('stage'), 'tag': manifest.get('tag'),
        'source_commit': manifest.get('source_commit'), 'runtime_sha256': digest,
        'policy': (manifest.get('release_readiness') or {}).get('desktop_acceptance'),
    }


def walk_specs(suite: dict, file: str = ''):
    file = suite.get('file') or file
    for spec in suite.get('specs', []):
        yield spec, spec.get('file') or file
    for child in suite.get('suites', []):
        yield from walk_specs(child, file)


def outcome(test: dict) -> str:
    status = test.get('status')
    if status == 'skipped':
        return 'skipped'
    if status == 'expected' and test.get('results') and all(r.get('status') == 'passed' for r in test['results']):
        return 'passed'
    return 'failed'


def performance_notes(test: dict) -> list[str]:
    """Measured real-time performance a test reported as `performance` annotations. It is evidence
    about the host and engine, recorded beside the outcome; it never decides a game's status."""
    notes: list[str] = []
    for source in [test, *test.get('results', [])]:
        for annotation in source.get('annotations', []) or []:
            description = annotation.get('description')
            if annotation.get('type') == 'performance' and isinstance(description, str) and description not in notes:
                notes.append(description)
    return notes


def missing_marker(engine: str, source: str, reason: str, run: dict | None) -> dict:
    """Written in place of results when a job produced none, so an earlier attempt's results never stand in."""
    return {'schema_version': RESULT_SCHEMA, 'kind': MISSING_KIND, 'engine': engine, 'source': source,
            'reason': reason, 'run': run}


def collect(report: dict, identity: dict, engine: str, source: str, site: dict, run: dict | None = None) -> dict:
    if engine not in ENGINES or source not in SOURCES:
        raise ValueError(f'Unknown engine {engine!r} or source {source!r}')
    if identity.get('project') != engine or identity.get('engine') != engine:
        raise ValueError(f'Browser identity is for {identity.get("project")!r}, not {engine}')
    if not re.fullmatch(r'\d+(\.\d+)+', str(identity.get('version', ''))):
        raise ValueError('Browser identity lacks a real browser.version()')
    tests, stats = [], {'passed': 0, 'failed': 0, 'skipped': 0}
    identity_passed = False
    for suite in report.get('suites', []):
        for spec, file in walk_specs(suite):
            for test in spec.get('tests', []):
                if test.get('projectName') != engine:
                    continue  # A run may cover several engines; each is collected on its own.
                result = outcome(test)
                stats[result] += 1
                if file.endswith('browser-identity.spec.ts') and result == 'passed':
                    identity_passed = True
                # Playwright's JSON report lists tags without their leading '@'.
                tags = {'@' + tag.lstrip('@') for tag in spec.get('tags', []) if isinstance(tag, str)}
                games = sorted(tag[len(TAG_PREFIX):] for tag in tags if tag.startswith(TAG_PREFIX))
                if games:
                    entry = {'file': file, 'title': spec.get('title'), 'games': games, 'outcome': result}
                    if notes := performance_notes(test):
                        entry['performance'] = notes
                    tests.append(entry)
    if not any(stats.values()):
        raise ValueError(f'The report holds no {engine} results')
    if not identity_passed:
        raise ValueError(f'The browser identity test did not pass in the {engine} report')
    if report.get('errors'):
        stats['failed'] += len(report['errors'])
    return {
        'schema_version': RESULT_SCHEMA, 'kind': 'nocpu-browser-results', 'engine': engine, 'source': source,
        'browser': identity, 'site': site, 'runtime_sha256': site['runtime_sha256'], 'stats': stats, 'run': run,
        'tests': sorted(tests, key=lambda item: (item['file'], item['title'])),
    }


def display_name(browser: dict) -> str:
    engine, version, playwright = browser['engine'], browser['version'], browser.get('playwright_version', '?')
    name = {'chromium': 'Chromium', 'firefox': 'Firefox', 'webkit': 'WebKit'}[engine]
    mode = ', headless' if browser.get('headless') else ''
    return f'{name} {version} (Playwright {playwright} build{mode})'


def policy_of(readiness: dict) -> dict:
    desktop = readiness.get('desktop_acceptance') or {}
    return {key: desktop.get(key) for key in ('required_for_release', 'games', 'browsers')}


def combine(results: list[dict], site: dict, policy: dict, run: dict | None = None,
            jobs: dict[str, str] | None = None) -> dict:
    """The acceptance record. `jobs` maps each producing job (browser, rom-browser) to its result in this
    run; any job that did not succeed keeps the record from passing, whatever artifacts are present."""
    games, required = policy['games'], policy['browsers']
    by_engine: dict[str, list[dict]] = {}
    problems: list[str] = []
    missing: dict[str, list[str]] = {}
    for result in results:
        if result.get('schema_version') != RESULT_SCHEMA or result.get('kind') not in ('nocpu-browser-results', MISSING_KIND):
            raise ValueError('Unsupported browser result')
        if run is not None and (result.get('run') or {}).get('id') != run['id']:
            raise ValueError(f"{result.get('engine')} ({result.get('source')}) results come from another workflow run")
        if result['kind'] == MISSING_KIND:
            where = f"{result['engine']} ({result['source']})"
            attempt = (result.get('run') or {}).get('attempt')
            problems.append(f"{where}: no fresh results" + (f' in attempt {attempt}' if attempt else '')
                            + f": {result.get('reason', 'unknown')}")
            missing.setdefault(result['engine'], []).append(result['source'])
            continue
        if result['runtime_sha256'] != site['runtime_sha256'] or result['site'] != site:
            raise ValueError(f"{result['engine']} ({result['source']}) results are for another build than the tested site")
        by_engine.setdefault(result['engine'], []).append(result)
    browsers = []
    for engine in [e for e in ENGINES if e in by_engine or e in required]:
        runs = by_engine.get(engine, [])
        sources = sorted(run_['source'] for run_ in runs)
        if len(set(sources)) != len(sources):
            raise ValueError(f'Duplicate {engine} results')
        versions = {(run_['browser']['version'], run_['browser'].get('headless')) for run_ in runs}
        if len(versions) > 1:
            raise ValueError(f'{engine} results come from different browser builds: {sorted(versions)}')
        entry = {'engine': engine, 'required': engine in required, 'sources': sources, 'games': {}}
        if any(run_.get('run') for run_ in runs):
            entry['runs'] = {run_['source']: run_['run'] for run_ in runs}
        if missing.get(engine):
            entry['missing_sources'] = sorted(missing[engine])
        if not runs:
            entry.update(status='not_run')
            problems.append(f'{engine}: no results')
            browsers.append(entry)
            continue
        browser = runs[0]['browser']
        entry.update(name=display_name(browser), version=browser['version'], os=browser.get('os'),
                     emulated_user_agent=browser.get('emulated_user_agent'), playwright_version=browser.get('playwright_version'))
        failed_runs = [f"{run_['source']}: {run_['stats']['failed']} failed" for run_ in runs if run_['stats']['failed']]
        merged: dict[tuple, dict] = {}
        for run_ in runs:
            for test in run_['tests']:
                key = (test['file'], test['title'])
                item = merged.setdefault(key, {'file': test['file'], 'title': test['title'], 'games': test['games'],
                                               'outcomes': {}})
                item['outcomes'][run_['source']] = test['outcome']
                if test.get('performance'):
                    item.setdefault('performance', {})[run_['source']] = test['performance']
        for game in games:
            tagged = [item for item in merged.values() if game in item['games']]
            listed = []
            for item in sorted(tagged, key=lambda value: (value['file'], value['title'])):
                outcomes = set(item['outcomes'].values())
                final = 'failed' if 'failed' in outcomes else 'passed' if 'passed' in outcomes else 'skipped'
                listed.append({'file': item['file'], 'title': item['title'], 'outcome': final,
                               'runs': dict(sorted(item['outcomes'].items()))})
                if item.get('performance'):
                    listed[-1]['performance'] = dict(sorted(item['performance'].items()))
            if any(test['outcome'] == 'failed' for test in listed):
                status = 'failed'
            elif listed and all(test['outcome'] == 'passed' for test in listed) and not failed_runs:
                status = 'passed'
            elif failed_runs:
                status = 'failed'
            else:
                status = 'not_run'
            entry['games'][game] = {'status': status, 'tests': listed}
            if status != 'passed' and engine in required:
                skipped = [t['title'] for t in listed if t['outcome'] == 'skipped']
                problems.append(f'{engine}/{game}: {status}' + (f' (skipped: {"; ".join(skipped)})' if skipped else '')
                                + ('' if listed else ' (no tagged tests)'))
        if failed_runs:
            problems.append(f'{engine}: ' + ', '.join(failed_runs))
        entry['status'] = 'failed' if failed_runs else 'passed' if all(
            value['status'] == 'passed' for value in entry['games'].values()) and not missing.get(engine) else 'incomplete'
        browsers.append(entry)
    required_entries = [entry for entry in browsers if entry['required']]
    if all(entry.get('status') == 'passed' for entry in required_entries) and not problems:
        status = 'passed'
    elif any(entry.get('status') == 'failed' or any(g['status'] == 'failed' for g in entry['games'].values())
             for entry in required_entries):
        status = 'failed'
    else:
        status = 'incomplete'
    unfinished = {name: result for name, result in (jobs or {}).items() if result != 'success'}
    for name, result in sorted(unfinished.items()):
        problems.append(f'job {name}: {result or "unknown"}, so its results are not fresh evidence for this run')
    if status == 'passed' and (unfinished or problems):
        status = 'failed' if 'failure' in unfinished.values() else 'incomplete'
    record = {
        'schema_version': RECORD_SCHEMA, 'project': 'NoCPU', 'kind': 'desktop-acceptance',
        'version': site['version'], 'stage': site['stage'], 'tag': site['tag'], 'source_commit': site['source_commit'],
        'runtime_sha256': site['runtime_sha256'], 'status': status,
        'policy': policy,
        'summary': {game: {entry['engine']: entry['games'].get(game, {}).get('status', 'not_run') for entry in browsers}
                    for game in games},
        'browsers': browsers, 'problems': problems, 'limitations': LIMITATIONS,
        'generated_by': 'tools/desktop-acceptance.py combine, from the browser jobs of the workflow run that tested '
                        'this exact packaged site',
    }
    if run:
        record['workflow_run'] = run
    if jobs:
        record['jobs'] = dict(sorted(jobs.items()))
    return record


def check_record(record: dict, release: dict) -> None:
    """Refuse a record that does not describe this build or claims more than its own results show."""
    if record.get('schema_version') != RECORD_SCHEMA or record.get('kind') != 'desktop-acceptance':
        raise ValueError('Not a desktop acceptance record')
    for key in ('version', 'stage', 'tag', 'source_commit', 'runtime_sha256'):
        if record.get(key) != release.get(key):
            raise ValueError(f'Acceptance record {key} {record.get(key)!r} does not match the release build {release.get(key)!r}')
    policy = release.get('policy') or {}
    shipped = {key: policy.get(key) for key in ('required_for_release', 'games', 'browsers')}
    if record.get('policy') != shipped:
        raise ValueError('Acceptance record policy differs from the policy shipped in BUILD-MANIFEST.json')
    browsers = {entry['engine']: entry for entry in record.get('browsers', [])}

    def game_passed(engine: str, game: str) -> bool:
        result = browsers[engine]['games'].get(game, {})
        tests = result.get('tests') or []
        return result.get('status') == 'passed' and bool(tests) and all(test['outcome'] == 'passed' for test in tests)
    every_required_passed = bool(shipped['games']) and all(
        browsers.get(engine, {}).get('status') == 'passed' and all(game_passed(engine, game) for game in shipped['games'])
        for engine in shipped['browsers'])
    if record.get('status') == 'passed':
        if not every_required_passed or record.get('problems'):
            raise ValueError('Acceptance record claims passed but its own results do not show every required game passing')
        for engine in shipped['browsers']:
            if not re.search(r'\(Playwright [^)]* build', str(browsers[engine].get('name', ''))) \
                    or 'Chrome' in browsers[engine]['name']:
                raise ValueError('Acceptance record must name the Playwright engine builds precisely')
    elif record.get('status') not in ('failed', 'incomplete'):
        raise ValueError('Unknown acceptance status')
    if shipped['required_for_release'] and record.get('status') != 'passed':
        raise ValueError('Desktop acceptance is required for this release and did not pass: '
                         + '; '.join(record.get('problems') or [record.get('status', '?')]))


def run_info() -> dict | None:
    if not os.environ.get('GITHUB_RUN_ID'):
        return None
    server, repository = os.environ.get('GITHUB_SERVER_URL', ''), os.environ.get('GITHUB_REPOSITORY', '')
    return {'id': int(os.environ['GITHUB_RUN_ID']), 'attempt': int(os.environ.get('GITHUB_RUN_ATTEMPT', '1')),
            'url': f"{server}/{repository}/actions/runs/{os.environ['GITHUB_RUN_ID']}"}


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    one = commands.add_parser('collect')
    one.add_argument('--engine', required=True, choices=ENGINES)
    one.add_argument('--source', required=True, choices=SOURCES)
    one.add_argument('--report', type=Path, required=True)
    one.add_argument('--identity', type=Path, required=True)
    one.add_argument('--site', type=Path, required=True)
    one.add_argument('--output', type=Path, required=True,
                     help='results, or on any failure a missing-results marker (and exit 1)')
    many = commands.add_parser('combine')
    many.add_argument('--inputs', type=Path, required=True, help='directory of collected *.json results')
    many.add_argument('--site', type=Path, required=True)
    many.add_argument('--output', type=Path, required=True)
    many.add_argument('--require-passed', action='store_true')
    many.add_argument('--job', action='append', default=[], metavar='NAME=RESULT',
                      help="a producing job's result in this run (needs.<job>.result); repeat per job")
    check = commands.add_parser('verify')
    check.add_argument('--record', type=Path, required=True)
    check.add_argument('--zip', type=Path, required=True)
    check.add_argument('--tag', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'collect':
            try:
                site = site_identity(args.site)
                site.pop('policy')
                result = collect(json.loads(args.report.read_text()), json.loads(args.identity.read_text()),
                                 args.engine, args.source, site, run_info())
            except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
                write_json(args.output, missing_marker(args.engine, args.source, str(exc), run_info()))
                raise
            write_json(args.output, result)
            print(f"{args.engine} ({args.source}): {result['stats']} at runtime {site['runtime_sha256']}")
        elif args.command == 'combine':
            site = site_identity(args.site)
            policy = site.pop('policy')
            if not isinstance(policy, dict):
                raise ValueError('The tested site carries no desktop acceptance policy')
            results = [json.loads(path.read_text()) for path in sorted(args.inputs.glob('*.json'))]
            jobs = {}
            for item in args.job:
                name, _, result = item.partition('=')
                if not name:
                    raise ValueError(f'--job needs NAME=RESULT, not {item!r}')
                jobs[name] = result
            record = combine(results, site, {key: policy.get(key) for key in ('required_for_release', 'games', 'browsers')},
                             run_info(), jobs)
            write_json(args.output, record)
            print(f"Desktop acceptance {record['status']} for {site['version']} runtime {site['runtime_sha256']}")
            for game, engines in record['summary'].items():
                print(f'  {game}: ' + ', '.join(f'{engine} {status}' for engine, status in engines.items()))
            for problem in record['problems']:
                print(f'  problem: {problem}')
            if args.require_passed and record['status'] != 'passed':
                raise ValueError(f"desktop acceptance {record['status']}")
        else:
            release = zip_identity(args.zip)
            if release['tag'] != args.tag or release['stage'] != 'release':
                raise ValueError(f'{args.zip.name} is not the release build for {args.tag}')
            check_record(json.loads(args.record.read_text()), release)
            print(f'Desktop acceptance record matches {args.tag} runtime {release["runtime_sha256"]}')
        return 0
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        print(f'Desktop acceptance: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
