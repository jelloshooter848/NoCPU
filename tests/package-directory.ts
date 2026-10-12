// SPDX-License-Identifier: GPL-3.0-or-later
// Bind packaged browser tests to one reviewed ignored-build artifact.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

export function packagedDirectory(root: string, requested = process.env.NOCPU_TEST_PACKAGE_DIR ?? 'build/pages'): string {
  const build = realpathSync(resolve(root, 'build'));
  const lexical = resolve(root, requested);
  const actual = realpathSync(lexical);
  const inside = relative(build, actual);
  if (!inside || inside === '..' || inside.startsWith('../') || isAbsolute(inside)
    || actual !== lexical || !statSync(actual).isDirectory()) {
    throw new Error('Packaged browser tests require a real directory inside ignored build output, without symlinks or path escape.');
  }
  const manifestPath = resolve(actual, 'BUILD-MANIFEST.json');
  if (realpathSync(manifestPath) !== manifestPath) throw new Error('The public package manifest must not be a symlink.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest?.project !== 'NoCPU' || manifest?.schema_version !== 1 || !Array.isArray(manifest.runtime_files)) {
    throw new Error('Packaged browser tests require a NoCPU public package manifest.');
  }
  for (const entry of manifest.runtime_files) {
    if (typeof entry?.path !== 'string') throw new Error('Invalid public package inventory path.');
    const path = resolve(actual, entry.path);
    const within = relative(actual, path);
    if (!within || within === '..' || within.startsWith('../') || isAbsolute(within)
      || realpathSync(path) !== path || !statSync(path).isFile()) {
      throw new Error('Public package inventory files must remain inside the package without symlinks.');
    }
  }
  return actual;
}

// Playwright launches its server through a shell; quote the path as one literal
// argument including any apostrophe, dollar sign, backtick or whitespace.
export function shellArgument(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'"; }
