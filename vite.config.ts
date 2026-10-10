import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const inputPaths = (): string[] => {
  const inputs = ['VERSION', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'web/index.html'].map((path) => join(root, path));
  inputs.push(...files(join(root, 'web/src')), ...files(join(root, 'web/public')).filter((path) => !path.startsWith(join(root, 'web/public/core') + '/')));
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
