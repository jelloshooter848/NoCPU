// SPDX-License-Identifier: GPL-3.0-or-later
// The About panel build string (docs/RELEASING.md, "The version string").

/** Without a matching manifest (for example the Vite dev server) the build is `vX.Y.Z-dev`. */
export function devBuildString(version: string): string { return `v${version}-dev`; }

/**
 * A site packaged from its release tag shows `vX.Y.Z` (or `vX.Y.Z-rc.N`); any
 * other packaged build shows `vX.Y.Z-dev.<shortsha>` from its source commit.
 */
export function buildString(version: string, manifest: unknown): string {
  const dev = devBuildString(version);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return dev;
  const fields = manifest as Record<string, unknown>;
  if (fields.schema_version !== 1 || fields.project !== 'NoCPU' || fields.version !== version) return dev;
  if (fields.stage === 'release' && fields.tag === `v${version}`) return `v${version}`;
  const commit = typeof fields.source_commit === 'string' && /^[0-9a-f]{7,64}$/.test(fields.source_commit) ? fields.source_commit : '';
  return commit ? `${dev}.${commit.slice(0, 7)}` : dev;
}
