#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Measure real-time simulation speed in Playwright's desktop browser builds.
// Reported, never gated: this is not part of CI or any test suite
// (docs/PERFORMANCE.md). It changes no circuit input timing that a comparison
// reads; the browser tests and original/native/Wasm comparisons are separate.
//
// Two modes, both per engine and game, as the median of --repeats runs:
//   app   the shipped page (?debug): start play, then "raw" = the worker's held
//         clock stepped as fast as it goes (simulated / wall seconds), and
//         "paced" = the app's own wall-clock pacing loop over --paced-seconds.
//   core  the Wasm module alone in a dedicated worker, no app: 5 ms advances,
//         PCM/collision/event buffers drained every slice and one frame copy
//         per 16.667 wall ms, as the worker does for the page. Separates engine/core
//         speed from app overhead.
//
// Usage (after `make web-preview` or `npm run build`):
//   node tools/measure-speed.mjs [--mode app,core] [--engines chromium,firefox,webkit]
//     [--games all|pong,hiway,...] [--repeats 3] [--raw-seconds 2] [--paced-seconds 5]
//     [--core-seconds 5] [--site build/pages | --base-url http://127.0.0.1:4673/NoCPU/]
//     [--port 4673] [--core-module build/core/wasm/nocpu.js] [--rom-dir build/roms]
//     [--firefox-release /path/to/firefox] [--label TEXT] [--output build/perf/speed-<stamp>.json]
//     [--resume 1]   (keep the measurements already in --output and add the missing ones)
//   node tools/measure-speed.mjs --table FILE.json   (print the Markdown table of a saved run)
// The output is rewritten after every measurement; a failed run is recorded
// with its error and the next one continues.
//
// Engine `firefox-release` drives a release Firefox (Mozilla's own build, not
// Playwright's) through WebDriver BiDi, given its executable with
// --firefox-release or NOCPU_FIREFOX_RELEASE. Playwright's Firefox build runs
// WebAssembly with its baseline compiler only (its optimizing compiler is
// unavailable there), so its numbers do not represent Firefox users; see
// docs/PERFORMANCE.md.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(ROOT, 'build/playwright');
const { chromium, firefox, webkit, devices } = await import('playwright');

const ALL_GAMES = ['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4', 'rebound', 'gotcha',
  'quadrapong', 'crossfire', 'tvbasketball', 'pinpong', 'hiway', 'antiaircraft', 'sharkjaws', 'jetfighter', 'attack'];
// The private fixture archive of each ROM-backed game (docs/ROMS.md).
const ROM_FILES = { stuntcycle: 'stuntcyc.zip', indy4: 'indy4.zip', antiaircraft: 'antiairc.zip', sharkjaws: 'sharkjaw.zip',
  jetfighter: 'jetfight.zip', attack: 'attckexd.zip' };
// Core IDs (core/nocpu.h, docs/ARCHITECTURE.md).
const CORE_IDS = Object.fromEntries(ALL_GAMES.map((id, index) => [id, index]));
const options = { mode: 'app', engines: 'chromium,firefox,webkit', games: 'all', repeats: 3, rawSeconds: 2, pacedSeconds: 5,
  coreSeconds: 5, site: 'build/pages', baseUrl: '', port: 4673, coreModule: 'build/core/wasm/nocpu.js',
  romDir: process.env.NOCPU_ROM_DIR ?? '', resume: '', table: '', firefoxRelease: process.env.NOCPU_FIREFOX_RELEASE ?? '', label: '', output: '' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (!(key in options) || process.argv[i + 1] === undefined) {
    console.error(`Unknown or incomplete option ${process.argv[i]}; see the usage at the top of ${fileURLToPath(import.meta.url)}`);
    process.exit(2);
  }
  options[key] = typeof options[key] === 'number' ? Number(process.argv[i + 1]) : process.argv[i + 1];
}
const modes = options.mode.split(',');
const engines = options.engines.split(',');
const games = options.games === 'all' ? ALL_GAMES : options.games.split(',');
if (modes.some((m) => !['app', 'core'].includes(m)) || engines.some((e) => !['chromium', 'firefox', 'webkit', 'firefox-release'].includes(e))
  || (engines.includes('firefox-release') && !options.firefoxRelease)
  || games.some((g) => !ALL_GAMES.includes(g)) || !(options.repeats >= 1)) throw new Error('Invalid --mode, --engines, --games or --repeats.');
const romGames = games.filter((g) => ROM_FILES[g]);
const romDir = options.romDir ? resolve(options.romDir) : '';
const skipped = romGames.filter((g) => !romDir || !existsSync(join(romDir, ROM_FILES[g])));

const launchers = {
  chromium: () => chromium.launch(),
  firefox: () => firefox.launch(),
  webkit: () => webkit.launch({ executablePath: process.env.NOCPU_WEBKIT_EXECUTABLE || undefined }),
  'firefox-release': () => firefox.launch({ channel: 'moz-firefox', executablePath: resolve(options.firefoxRelease) }),
};
// The release Firefox gets no device emulation: its BiDi implementation lacks
// some of the commands Playwright uses for it. The window keeps its default size.
const profiles = { chromium: devices['Desktop Chrome'], firefox: devices['Desktop Firefox'], webkit: devices['Desktop Safari'], 'firefox-release': { viewport: null } };
const median = (values) => { const s = [...values].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

// ---- app mode -------------------------------------------------------------
let server;
async function startServer() {
  if (options.baseUrl) return options.baseUrl;
  const site = resolve(options.site);
  if (!existsSync(join(site, 'index.html'))) throw new Error(`No site at ${site}; run make web-preview (or pass --site/--base-url).`);
  server = spawn('python3', [join(ROOT, 'tools/serve-pages.py'), '--directory', site, '--base', '/NoCPU/', '--host', '127.0.0.1', '--port', String(options.port)], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${options.port}/NoCPU/`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(base)).ok) return base; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The site server did not start on port ${options.port}.`);
}

const debug = (page, name, ...args) => page.evaluate(([name, args]) => window.__nocpuDebug[name](...args), [name, args]);
// 50 ms per request: the page gives each debug request 5 wall seconds, which
// a 1 s step of a heavy game exceeds in a slow engine.
async function stepSeconds(page, seconds) {
  for (let left = Math.round(seconds * 1e6); left > 0; left -= 50_000) await debug(page, 'stepClock', Math.min(50_000, left));
}

async function measureApp(browser, engine, base, gameId) {
  const context = await browser.newContext({ ...profiles[engine], baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto('./?debug');
    if (ROM_FILES[gameId]) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByTestId('rom-game').selectOption(gameId);
      await page.getByTestId('remember-roms').setChecked(false);
      await page.getByTestId('rom-import').setInputFiles({ name: `${gameId}.zip`, mimeType: 'application/zip', buffer: readFileSync(join(romDir, ROM_FILES[gameId])) });
      await page.getByTestId('rom-import-status').filter({ hasText: 'ROM validated' }).waitFor({ timeout: 30_000 });
      await page.getByTestId('back').click();
    }
    await page.getByTestId('open-library').click();
    await page.getByTestId(`game-${gameId}`).click();
    await page.getByTestId('play-selected').click();
    await page.locator('.game-shell[data-screen="playing"]').waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="insert-coin"]')?.hasAttribute('disabled'), null, { timeout: 60_000 });
    // Let the first simulated second run paced: a heavy circuit's first steps
    // (Pin Pong builds its large optimizer tables) can outlast the page's 5 s
    // debug request limit in a slow engine. Then into play on the held clock.
    for (const started = Date.now(); BigInt((await page.evaluate(() => window.__nocpuDebug.snapshot())).timePs) < 1_000_000_000_000n;) {
      if (Date.now() - started > 300_000) throw new Error('The first simulated second took over 5 minutes.');
      await page.waitForTimeout(500);
    }
    await debug(page, 'holdClock', true);
    await page.getByTestId('insert-coin').click();
    await stepSeconds(page, 1);
    const start = page.getByTestId('start-game');
    const pressStart = async () => { if (await start.isVisible() && await start.isEnabled()) { await start.click(); await stepSeconds(page, 1); } };
    await pressStart();
    if (gameId === 'pinpong') await pressStart(); // Start serves each ball.
    if (gameId === 'breakout') { await page.keyboard.down('KeyS'); await stepSeconds(page, 0.2); await page.keyboard.up('KeyS'); }
    if (gameId === 'hiway') await page.keyboard.down('ArrowUp'); // Held accelerator: driving.
    if (gameId === 'stuntcycle') await page.keyboard.down('ArrowUp');
    if (gameId === 'antiaircraft') { await page.keyboard.down('KeyQ'); await page.keyboard.down('KeyO'); } // Both launchers keep firing.
    await stepSeconds(page, 0.5);
    const now = () => page.evaluate(() => performance.now());
    // Raw: requests sized to about half a wall second each (at most 1 simulated
    // second), so request round trips cost little against the stepping itself.
    let probe = await now();
    await debug(page, 'stepClock', 100_000);
    const stepUs = Math.max(100_000, Math.min(1_000_000, Math.floor(0.5 / ((await now() - probe) / 1000) * 10) * 10_000));
    let wall = await now();
    for (let left = Math.round(options.rawSeconds * 1e6); left > 0; left -= stepUs) await debug(page, 'stepClock', Math.min(stepUs, left));
    const raw = options.rawSeconds / ((await now() - wall) / 1000);
    await debug(page, 'holdClock', false);
    const read = () => page.evaluate(async () => ({ s: await window.__nocpuDebug.snapshot(), wall: performance.now() }));
    // Let pacing settle for half a second, then measure.
    await page.waitForTimeout(500);
    const before = await read();
    await page.waitForTimeout(options.pacedSeconds * 1000);
    const after = await read();
    const simulated = Number(BigInt(after.s.timePs) - BigInt(before.s.timePs)) / 1e12;
    const wallSeconds = (after.wall - before.wall) / 1000;
    const workerMs = after.s.worker.totalMs - before.s.worker.totalMs;
    const steps = after.s.worker.steps - before.s.worker.steps;
    return { raw, paced: simulated / wallSeconds, simulatedSeconds: simulated, wallSeconds,
      workerBusy: workerMs / (wallSeconds * 1000), outputsPerSecond: steps / wallSeconds,
      framesPresentedPerSecond: (after.s.presentedFrame - before.s.presentedFrame) / wallSeconds,
      circuitFramesPerSecond: (after.s.frame - before.s.frame) / wallSeconds, active: after.s.nativeRunning };
  } finally {
    await context.close();
  }
}

// ---- core mode ------------------------------------------------------------
const CORE_WORKER = `
self.onmessage = async ({ data }) => {
  try {
    const core = await (await import(data.moduleUrl)).default({ print() {}, printErr() {} });
    const game = data.game;
    let dip = 0, pot = 0;
    if (core._nocpu_game_info(game, 0) === 1) { dip = core._nocpu_game_info(game, 7); pot = core._nocpu_game_info(game, 11); }
    else if (game === 3) dip = 3; else if (game === 2) pot = 970000; else if (game === 4) dip = 76; else if (game === 5) pot = 720000;
    if (data.roms) {
      if (core._nocpu_rom_begin(game) !== 1) throw new Error('rom_begin');
      data.roms.forEach((bytes, slot) => { const p = core._nocpu_rom_buffer(slot, bytes.byteLength); if (!p) throw new Error('rom size'); core.HEAPU8.set(bytes, p); });
      if (core._nocpu_rom_finish() !== 1) throw new Error('rom crc');
    }
    if (core._nocpu_create_game(game, 848, dip, pot) !== 1) throw new Error('create');
    const advance = (us) => { while (us > 0) { const s = Math.min(5000, us); if (core._nocpu_advance(s) !== 1) throw new Error('advance');
      core.HEAP16.slice(core._nocpu_audio() >>> 1, (core._nocpu_audio() >>> 1) + core._nocpu_audio_count());
      core._nocpu_audio_clear(); core._nocpu_collisions_clear(); core._nocpu_events_clear(); us -= s; } };
    advance(1e6); core._nocpu_coin(1); advance(1e5); core._nocpu_coin(0); advance(9e5);
    core._nocpu_start(1); advance(1e5); core._nocpu_start(0); advance(9e5);
    if (game === 11) { core._nocpu_start(1); advance(1e5); core._nocpu_start(0); advance(9e5); }
    if (game === 12) core._nocpu_button(0, 1, 1);
    if (game === 13) { core._nocpu_button(0, 1, 1); core._nocpu_button(1, 3, 1); }
    // Warm up the engine's tiers for a wall second, then measure.
    for (const warm = performance.now(); performance.now() - warm < 1000;) advance(5000);
    const total = data.seconds * 1e6; let done = 0;
    const started = performance.now(); let nextFrame = started;
    while (done < total) { advance(5000); done += 5000;
      // One frame copy per 16.667 wall ms, as the page's animation frames request.
      if (performance.now() >= nextFrame) { const o = core._nocpu_frame(); core.HEAPU8.slice(o, o + core._nocpu_width() * core._nocpu_height() * 4); nextFrame += 1000 / 60; } }
    postMessage({ raw: data.seconds / ((performance.now() - started) / 1000) });
  } catch (error) { postMessage({ error: String(error && error.stack || error) }); }
};`;

// A local server for the bare core page: the worker script and the module.
let coreServer;
async function coreOrigin() {
  if (coreServer) return coreServer.origin;
  const { createServer } = await import('node:http');
  const moduleFile = resolve(options.coreModule);
  const http = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const body = path === '/' ? '<!doctype html><title>core speed</title>' : path === '/worker.js' ? CORE_WORKER
      : path === '/nocpu.js' || path === '/nocpu.wasm' ? readFileSync(join(dirname(moduleFile), path.slice(1))) : null;
    if (body === null) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': path === '/' ? 'text/html' : path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
    response.end(body);
  });
  await new Promise((r) => http.listen(options.port + 1, '127.0.0.1', r));
  coreServer = { http, origin: `http://127.0.0.1:${options.port + 1}` };
  return coreServer.origin;
}

async function measureCore(browser, engine, gameId) {
  const origin = await coreOrigin();
  const context = await browser.newContext({ ...profiles[engine] });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/`);
    const roms = ROM_FILES[gameId] ? await romMembers(gameId) : null;
    const result = await page.evaluate(({ game, seconds, roms }) => new Promise((resolveResult) => {
      const worker = new Worker('/worker.js', { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolveResult(data); };
      worker.onerror = (event) => resolveResult({ error: event.message || 'worker error' });
      worker.postMessage({ moduleUrl: new URL('/nocpu.js', location.href).href, game, seconds, roms: roms && roms.map((r) => new Uint8Array(r)) });
    }), { game: CORE_IDS[gameId], seconds: options.coreSeconds, roms });
    if (result.error) throw new Error(result.error);
    return { raw: result.raw };
  } finally {
    await context.close();
  }
}

// ROM members for core mode, in the core's slot order, matched by CRC32 to the
// game manifest as the app does, read with the app's pinned fflate helper and
// never written anywhere.
async function romMembers(gameId) {
  const { unzipSync } = await import('fflate');
  const { crc32 } = await import('node:zlib');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/game-manifest.json'), 'utf8')).games.find((g) => g.id === gameId);
  // Registered games' core slots are the manifest's members in order.
  const names = gameId === 'stuntcycle' ? ['82s123.4d', '82s115.1fh'] : gameId === 'indy4' ? ['indy.s1', 'indy.s2', 'indy.c1', 'indy.c2']
    : manifest.roms.map((rom) => rom.expected_member);
  const files = Object.values(unzipSync(readFileSync(join(romDir, ROM_FILES[gameId]))));
  return names.map((name) => {
    const accepted = manifest.roms.find((rom) => rom.expected_member === name).accepted_crc32.map((crc) => parseInt(crc, 16));
    const bytes = files.find((data) => accepted.includes(crc32(data) >>> 0));
    if (!bytes) throw new Error(`No member of ${ROM_FILES[gameId]} matches ${name}`);
    return [...bytes];
  });
}

// Markdown table: one row per game, one column per engine and mode.
function markdownTable(results, engines, modes, games) {
  const columns = engines.flatMap((engine) => modes.map((mode) => [engine, mode]));
  const versionOf = (engine) => results.find((r) => r.engine === engine)?.version ?? '';
  const header = `| Game | ${columns.map(([e, m]) => `${e} ${versionOf(e)} ${m === 'app' ? 'paced / raw' : 'core raw'}`).join(' | ')} |`;
  const lines = [header, `| --- | ${columns.map(() => '---').join(' | ')} |`];
  for (const gameId of games) {
    lines.push(`| ${gameId} | ${columns.map(([engine, mode]) => {
      const r = results.find((x) => x.engine === engine && x.game === gameId && (x.mode === mode || x.skipped));
      return !r ? '' : r.skipped ? 'skipped' : r.failed ? 'failed' : mode === 'app' ? `${r.paced.toFixed(2)} / ${r.raw.toFixed(2)}` : r.raw.toFixed(2);
    }).join(' | ')} |`);
  }
  return lines.join('\n');
}

if (options.table) {
  const saved = JSON.parse(readFileSync(resolve(options.table), 'utf8')).results;
  const order = (list, all) => all.filter((x) => list.some((r) => r === x));
  const savedEngines = order([...new Set(saved.map((r) => r.engine))], ['chromium', 'firefox', 'webkit', 'firefox-release']);
  const savedModes = order([...new Set(saved.filter((r) => r.mode).map((r) => r.mode))], ['app', 'core']);
  console.log(markdownTable(saved, savedEngines, savedModes, ALL_GAMES.filter((g) => saved.some((r) => r.game === g))));
  process.exit(0);
}

// ---- run --------------------------------------------------------------------
const output = options.output || join(ROOT, 'build/perf', `speed-${new Date().toISOString().replace(/[:.]/g, '')}.json`);
const results = options.resume && existsSync(resolve(output)) ? JSON.parse(readFileSync(resolve(output), 'utf8')).results.filter((r) => !r.failed) : [];
const environment = { cpu: cpus()[0]?.model, cpus: cpus().length, loadavgAtStart: loadavg(), node: process.version, label: options.label };
function save(table = '') {
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(resolve(output), `${JSON.stringify({ options: { ...options, romDir: romDir ? '(set)' : '' }, environment, results, table }, null, 2)}\n`);
}
const base = modes.includes('app') ? await startServer() : '';
try {
  for (const engine of engines) {
    const browser = await launchers[engine]();
    const version = browser.version();
    try {
      for (const gameId of games) {
        if (skipped.includes(gameId)) { results.push({ engine, version, game: gameId, skipped: 'no ROM fixture (--rom-dir)' }); continue; }
        for (const mode of modes) {
          if (results.some((r) => r.engine === engine && r.game === gameId && r.mode === mode)) continue;
          const runs = [];
          try {
            for (let repeat = 0; repeat < options.repeats; repeat += 1) {
              runs.push(mode === 'app' ? await measureApp(browser, engine, base, gameId) : await measureCore(browser, engine, gameId));
            }
          } catch (error) {
            console.log(`${engine} ${version} ${gameId} ${mode}: FAILED ${String(error).split('\n')[0]}`);
            results.push({ engine, version, game: gameId, mode, failed: String(error).split('\n')[0], runs });
            save();
            continue;
          }
          const entry = { engine, version, game: gameId, mode, runs, raw: median(runs.map((r) => r.raw)) };
          if (mode === 'app') entry.paced = median(runs.map((r) => r.paced));
          results.push(entry);
          save();
          console.log(`${engine} ${version} ${gameId} ${mode}: ${entry.paced !== undefined ? `paced ${entry.paced.toFixed(2)} / ` : ''}raw ${entry.raw.toFixed(2)}`
            + `  (runs: ${runs.map((r) => (r.paced !== undefined ? `${r.paced.toFixed(2)}/` : '') + r.raw.toFixed(2)).join(', ')})`);
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server?.kill();
  coreServer?.http.close();
}
environment.loadavgAtEnd = loadavg();

const table = markdownTable(results, engines, modes, games);
console.log(`\n${table}\n`);
save(table);
console.log(`Wrote ${output}`);
