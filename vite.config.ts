import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const version = readFileSync(new URL('./VERSION', import.meta.url), 'utf8').trim();
const base = process.env.NOCPU_BASE_PATH ?? '/NoCPU/';
if (!base.startsWith('/') || !base.endsWith('/') || !/^\/[A-Za-z0-9/._-]*$/.test(base) || base.split('/').some((part) => part === '.' || part === '..')) {
  throw new Error('NOCPU_BASE_PATH must be an absolute URL path ending in /.');
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Build inputs must not be symlinks: ${path}`);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  }).sort();
}
const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const hashes = (paths: string[], prefix: string): Record<string, string> =>
  Object.fromEntries(paths.map((path) => [relative(prefix, path).replaceAll('\\', '/'), sha256(path)]));

// Changing the dependency requires an explicit source/runtime audit and pin
// update here and in the packager, rather than silently relabelling its source.
const fflateManifest = 'tests/fflate-source-manifest.json';
const fflateManifestSha = 'f810cb2233b207513e8f012e9085bd822b5f4557c647d2d9e0a6c3eab1d08fc7';
const fflateIntegrity = 'sha512-cPJU47OaAoCbg0pBvzsgpTPhmhqI5eJjh/JIu8tPj5q+T7iLvW/JAYUqmE7KOB4R1ZyEhzBaIQpQpardBF5z8A==';
function dependencyInputs(): string[] {
  const checkedPath = (name: string): string => {
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe frontend input: ${name}`);
    let path = root;
    for (const part of name.split('/')) {
      path = join(path, part);
      if (lstatSync(path).isSymbolicLink()) throw new Error(`Frontend inputs must not be symlinks: ${name}`);
    }
    if (!lstatSync(path).isFile()) throw new Error(`Missing frontend input: ${name}`);
    return path;
  };
  if (sha256(checkedPath(fflateManifest)) !== fflateManifestSha) throw new Error('The audited fflate source manifest changed.');
  const manifest = JSON.parse(readFileSync(join(root, fflateManifest), 'utf8'));
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const installed = JSON.parse(readFileSync(checkedPath('node_modules/fflate/package.json'), 'utf8'));
  if (packageJson.dependencies?.fflate !== '0.8.2' || lock.packages?.['']?.dependencies?.fflate !== '0.8.2'
    || lock.packages?.['node_modules/fflate']?.version !== '0.8.2' || lock.packages?.['node_modules/fflate']?.integrity !== fflateIntegrity
    || installed.name !== 'fflate' || installed.version !== '0.8.2') throw new Error('fflate package, lock and installed runtime must match the audited 0.8.2 pin.');
  const paths = [fflateManifest, 'tests/fixtures/game-manifest.json', manifest.notice, `${manifest.preferred_source_directory}/NOCPU_SOURCE.md`];
  for (const inputs of [manifest.source_files, manifest.runtime_inputs] as Record<string, string>[]) {
    for (const [name, digest] of Object.entries(inputs)) {
      if (sha256(checkedPath(name)) !== digest) throw new Error(`Missing or changed fflate input: ${name}`);
      paths.push(name);
    }
  }
  if (sha256(checkedPath(manifest.notice)) !== manifest.source_files[`${manifest.preferred_source_directory}/LICENSE`]) throw new Error('fflate notice must preserve the exact original license.');
  return paths.map(checkedPath);
}
const inputPaths = (): string[] => {
  const inputs = ['VERSION', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'web/index.html'].map((path) => join(root, path));
  inputs.push(...files(join(root, 'web/src')), ...files(join(root, 'web/public')).filter((path) => !path.startsWith(join(root, 'web/public/core') + '/')));
  inputs.push(...dependencyInputs());
  return inputs.sort();
};
let inputSnapshot: Record<string, string>;

export default defineConfig({
  root: 'web',
  base,
  define: {
    __NOCPU_VERSION__: JSON.stringify(version),
  },
  plugins: [{
    name: 'nocpu-build-provenance',
    apply: 'build',
    buildStart() { inputSnapshot = hashes(inputPaths(), root); },
    closeBundle() {
      if (JSON.stringify(hashes(inputPaths(), root)) !== JSON.stringify(inputSnapshot)) {
        throw new Error('Frontend source changed during the build. Rebuild from a stable checkout.');
      }
      const dist = join(root, 'build/web');
      const core = ['nocpu.js', 'nocpu.wasm'].map((name) => join(root, 'web/public/core', name));
      writeFileSync(join(root, 'build/web-provenance.json'), JSON.stringify({
        schema_version: 1, base, inputs: inputSnapshot,
        core: hashes(core, join(root, 'web/public')), outputs: hashes(files(dist), dist),
      }, null, 2) + '\n');
    },
  }],
  build: { outDir: '../build/web', emptyOutDir: true, target: 'es2022' },
});
