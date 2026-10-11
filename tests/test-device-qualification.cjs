// SPDX-License-Identifier: GPL-3.0-or-later
// Injected clocks and synthetic bytes validate reporting; they never qualify hardware.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const output = fs.mkdtempSync(path.join(root, 'build/qualification-test-'));
const compile = spawnSync(path.join(root, 'node_modules/.bin/tsc'), [
  '--noEmit', 'false', '--outDir', output, '--module', 'CommonJS', '--moduleResolution', 'Node',
  '--target', 'ES2022', '--strict', '--skipLibCheck', 'web/src/qualification.ts',
], { cwd: root, encoding: 'utf8' });
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
fs.writeFileSync(path.join(output, 'package.json'), '{"type":"commonjs"}\n');
after(() => fs.rmSync(output, { recursive: true, force: true }));
const { createQualificationRecorder, annotateQualificationReport } = require(path.join(output, 'qualification.js'));
const { createCoreAssetUrls, locateCoreAsset } = require(path.join(output, 'asset-identity.js'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function nativeState(patch = {}) {
  const identity = { generation: 1, resetId: 0, clockEpoch: 1, resetting: false, ready: true, failed: false };
  const audio = { generatedSamples: 100, scheduledSamples: 100, underruns: 3, discardedQueues: 2,
    coreOverruns: 0, transportDroppedSamples: 0, queueDepth: 1, queuedMs: 55, contextState: 'running' };
  return { timePs: '9007199254740993123', frame: 10, runN: 0, attractN: 1, paused: false, screen: 'playing',
    identityBefore: { ...identity }, identity: { ...identity }, audio,
    worker: { wasmMemoryCapacityBytes: 33554432 }, ...patch };
}
class TrackedTarget extends EventTarget {
  constructor() { super(); this.listeners = new Map(); }
  addEventListener(type, callback, options) { super.addEventListener(type, callback, options); this.listeners.set(callback, type); }
  removeEventListener(type, callback, options) { super.removeEventListener(type, callback, options); this.listeners.delete(callback); }
}

function harness(options = {}) {
  let wall = 0, current = nativeState(), rtt = 0, error, sequence = 0, deferred, snapshotCount = 0;
  const timers = new Map(), frames = new Map(), requests = [];
  const document = new TrackedTarget(), window = new TrackedTarget();
  document.hidden = false; document.hasFocus = () => true;
  document.querySelectorAll = () => [{ src: 'https://fixture.example/NoCPU/assets/entry.js' }];
  const globals = { document, window, location: new URL('https://fixture.example/NoCPU/?debug'),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id), requestAnimationFrame: (fn) => { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id) };
  const previousGlobals = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(globals).forEach(([key, value]) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }));
  const assets = new Map([
    ['assets/entry.js', Buffer.from('/* Synthetic loader identity, never game execution. */')],
    ['core/nocpu.js', Buffer.from('export default function syntheticModule() {}')],
    ['core/nocpu.wasm', Buffer.from('0061736d01000000', 'hex')],
    ['index.html', Buffer.from('<script type="module" src="assets/entry.js"></script>')],
  ]);
  const inventory = [...assets].map(([name, bytes]) => ({ path: name, sha256: sha256(bytes), size: bytes.length }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const jsHash = sha256(assets.get('core/nocpu.js')), wasmHash = sha256(assets.get('core/nocpu.wasm'));
  const moduleUrl = `https://fixture.example/NoCPU/core/nocpu.js?nocpu_js_sha256=${jsHash}&nocpu_wasm_sha256=${wasmHash}`;
  const wasmUrl = `https://fixture.example/NoCPU/core/nocpu.wasm?nocpu_wasm_sha256=${wasmHash}`;
  const manifest = { schema_version: 1, project: 'NoCPU', version: '0.3.1', stage: 'preview',
    buildId: 'a'.repeat(40), source_commit: 'a'.repeat(40), runtime_files: inventory, runtime_sha256: sha256(JSON.stringify(inventory)) };
  let manifestBytes = JSON.stringify(manifest);
  let manifestAvailable = true;
  const recorder = createQualificationRecorder({ snapshot: async () => {
    snapshotCount += 1; wall += rtt; if (error) throw error;
    if (deferred) { const query = deferred; deferred = undefined; return query; }
    return structuredClone(current);
  },
    manifestUrl: 'https://fixture.example/NoCPU/BUILD-MANIFEST.json', expectedVersion: '0.3.1',
    assetIdentity: { entryUrl: 'https://fixture.example/NoCPU/assets/entry.js', moduleUrl, wasmUrl, coreJsSha256: jsHash, coreWasmSha256: wasmHash },
    now: () => wall, environment: () => ({ visible: !document.hidden, focused: options.focused ?? true }),
    fetch: async (url, init) => {
      requests.push({ url: String(url), cache: init?.cache });
      const name = new URL(url).pathname.replace('/NoCPU/', '');
      if (name === 'BUILD-MANIFEST.json') return new Response(manifestBytes, { status: manifestAvailable ? 200 : 503 });
      const bytes = assets.get(name);
      return new Response(bytes ?? 'Missing asset', { status: bytes ? 200 : 404 });
    },
    ...options.recorderOptions });
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return { recorder, requests, document, window, timers, frames,
    setState: (value) => { current = value; }, state: () => structuredClone(current),
    setRtt: (value) => { rtt = value; }, failSnapshot: (value) => { error = value; },
    setManifest: (value) => { manifestBytes = typeof value === 'string' ? value : JSON.stringify(value); },
    manifest: () => ({ ...manifest }), setManifestAvailable: (value) => { manifestAvailable = value; },
    corruptAsset: (name, bytes) => assets.set(name, Buffer.from(bytes)),
    snapshotCount: () => snapshotCount, stepWall: (milliseconds) => { wall += milliseconds; },
    deferSnapshot() {
      let resolve, reject; deferred = new Promise((yes, no) => { resolve = yes; reject = no; });
      return { resolve, reject };
    },
    async start() { await recorder.prepare(); await recorder.start(); },
    async advance(milliseconds, patch = {}) {
      wall += milliseconds; current = { ...current, ...patch };
      const timer = [...timers].find(([, value]) => value.delay === 1000);
      assert.ok(timer, 'An active recorder must schedule its next observation');
      timers.delete(timer[0]); timer[1].fn(); await flush();
    },
    frame(at) { const first = frames.entries().next().value; assert.ok(first); frames.delete(first[0]); first[1](at); },
    cleanup() { recorder.dispose(); for (const [key, descriptor] of Object.entries(previousGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    } },
  };
}
async function using(callback, options) { const h = harness(options); try { await callback(h); } finally { h.cleanup(); } }
function nativeAfter(h, seconds, patch = {}) {
  const state = h.state(); return { timePs: (BigInt(state.timePs) + BigInt(seconds) * 1000000000000n).toString(), frame: state.frame + Number(seconds) * 60, ...patch };
}

test('native integer endpoints preserve low bits above Number precision and reports retain only scoped evidence', async () => using(async (h) => {
  const first = h.state(); first.privateRom = 'must never export'; first.heldKeys = ['Secret']; first.inputs = { paddle1: -32768 }; first.worker.secret = 123;
  h.setState(first); await h.start();
  await h.advance(1000, { timePs: (BigInt(first.timePs) + 1000000000017n).toString(), frame: 70 });
  const report = await h.recorder.finish();
  assert.ok(Math.abs(report.performance.simulation_seconds - 1.000000000017) < 1e-15);
  assert.equal(report.samples[0].state.timePs, first.timePs);
  assert.equal(report.performance.wall_seconds, 1);
  assert.equal(report.device.physical, null); assert.equal(report.release_ready, false);
  assert.deepEqual(report.observations, {}); assert.equal(report.performance.duration_requirement_met, false);
  assert.ok(!JSON.stringify(report).includes('must never export')); assert.ok(!JSON.stringify(report).includes('Secret'));
  assert.deepEqual(Object.keys(report.samples[0].state.worker), ['wasmMemoryCapacityBytes']);
  assert.match(report.performance.memory_scope, /capacity.*not.*total browser/i);
  assert.equal(report.manifest_start.manifest_sha256, sha256(report.manifest_start.manifest_bytes));
  assert.ok(h.requests.every((request) => request.cache === 'no-store'));
}));

test('active native stalls and long observation gaps remain in the speed denominator', async () => using(async (h) => {
  await h.start(); await h.advance(600000, nativeAfter(h, 600));
  await h.advance(60000); // Active native clock stalls while foreground wall time passes.
  const report = await h.recorder.finish();
  assert.equal(report.performance.wall_seconds, 660); assert.equal(report.performance.simulation_seconds, 600);
  assert.equal(report.performance.duration_requirement_met, true);
  assert.ok(report.performance.simulation_speed_ratio < .95); assert.equal(report.performance.speed_requirement_met, false);
  assert.equal(report.excluded_intervals.length, 0);
}));

test('snapshot rejection preserves stalled wall coverage and prevents a later apparently good run from passing', async () => using(async (h) => {
  await h.start(); h.failSnapshot(new Error('Synthetic worker request timeout'));
  await h.advance(30000); h.failSnapshot(undefined);
  await h.advance(600000, nativeAfter(h, 600));
  const report = await h.recorder.finish();
  assert.equal(report.performance.wall_seconds, 630); assert.equal(report.performance.simulation_seconds, 600);
  assert.equal(report.coverage_complete, false); assert.equal(report.performance.duration_requirement_met, false);
  assert.equal(report.performance.speed_requirement_met, false);
  assert.match(report.collection_errors.join(' '), /Synthetic worker request timeout/);
}));

test('RTT uncertainty prevents borderline duration and speed from auto-passing', async () => using(async (h) => {
  h.setRtt(1000); await h.start(); await h.advance(599000, nativeAfter(h, 570));
  const report = await h.recorder.finish();
  assert.equal(report.performance.wall_seconds, 600); assert.equal(report.performance.simulation_speed_ratio, .95);
  assert.equal(report.performance.timing_uncertainty_seconds, 1);
  assert.equal(report.performance.active_wall_lower_bound_seconds, 599);
  assert.equal(report.performance.duration_requirement_met, false); assert.equal(report.performance.speed_requirement_met, false);
  assert.ok(report.performance.conservative_simulation_speed_ratio < .95);
}));

test('rapid hidden-visible lifecycle transitions split intervals even when both sampled endpoints look active', async () => using(async (h) => {
  await h.start(); await h.advance(1000, nativeAfter(h, 1));
  h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange'));
  h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange'));
  await h.advance(1000, nativeAfter(h, 1)); await h.advance(1000, nativeAfter(h, 1));
  const report = await h.recorder.finish();
  assert.equal(report.performance.wall_seconds, 2); assert.equal(report.segments.length, 2);
  assert.equal(report.excluded_intervals[0].wall_seconds, 1); assert.equal(report.excluded_intervals[0].reason, 'foreground_boundary');
  assert.deepEqual(report.events.map((event) => event.reason), ['hidden', 'visible']);
}));

test('pause, attract, unready and failed states never count foreground elapsed time as active play', async () => {
  for (const patch of [{ paused: true }, { screen: 'paused' }, { runN: 1, attractN: 0 },
    { identity: { ...nativeState().identity, ready: false } }, { identity: { ...nativeState().identity, failed: true } }]) {
    await using(async (h) => {
      await h.start(); await h.advance(300000, nativeAfter(h, 300, patch));
      await h.advance(300000, nativeAfter(h, 300, { ...nativeState(), timePs: h.state().timePs }));
      const report = await h.recorder.finish();
      assert.equal(report.performance.wall_seconds, 0, JSON.stringify(patch));
      assert.equal(report.performance.duration_requirement_met, false); assert.equal(report.excluded_intervals.length, 2);
    });
  }
});

test('reset, worker replacement, clock epoch and within-query identity changes cannot bridge clocks', async () => {
  for (const key of ['resetId', 'generation', 'clockEpoch', 'resetting']) await using(async (h) => {
    await h.start(); const identity = h.state().identity; identity[key] = key === 'resetting' ? true : identity[key] + 1;
    await h.advance(1000, { identityBefore: { ...identity }, identity, timePs: '0', frame: 0 });
    const report = await h.recorder.finish();
    assert.equal(report.performance.wall_seconds, 0); assert.equal(report.performance.simulation_seconds, 0);
    assert.equal(report.excluded_intervals[0].reason, 'generation_reset_or_clock_boundary');
  });
  await using(async (h) => {
    await h.start(); await h.advance(1000, nativeAfter(h, 1, { identity: { ...h.state().identity, resetId: 1 } }));
    const report = await h.recorder.finish(); assert.equal(report.performance.wall_seconds, 0);
    assert.equal(report.excluded_intervals[0].reason, 'generation_reset_or_clock_boundary');
  });
});

test('unexplained native or cumulative audio regressions mark evidence incomplete', async () => {
  for (const patch of [{ timePs: '0' }, { frame: 0 }, { audio: { ...nativeState().audio, underruns: 0 } }]) await using(async (h) => {
    await h.start(); await h.advance(1000, { ...nativeAfter(h, 1), ...patch });
    const report = await h.recorder.finish(); assert.equal(report.performance.wall_seconds, 0);
    assert.equal(report.coverage_complete, false); assert.ok(report.collection_errors.length > 0);
  });
});

test('audio baselines, excluded counts, Wasm capacity and rAF opportunities keep distinct truthful scopes', async () => using(async (h) => {
  await h.start(); h.frame(0); h.frame(16); h.frame(32);
  await h.advance(1000, nativeAfter(h, 1, { audio: { ...h.state().audio, underruns: 5, scheduledSamples: 200 }, worker: { wasmMemoryCapacityBytes: 67108864 } }));
  await h.advance(1000, nativeAfter(h, 1, { paused: true, audio: { ...h.state().audio, underruns: 9 } }));
  const report = await h.recorder.finish({ observations: { input_response: 'Human supplied software observation' } });
  assert.equal(report.performance.audio_underruns, 2);
  assert.equal(report.performance.initial_audio_counters.underruns, 3);
  assert.equal(report.performance.excluded_audio_deltas.underruns, 4);
  assert.equal(report.performance.memory_start_bytes, 33554432); assert.equal(report.performance.memory_end_bytes, 67108864);
  assert.equal(report.performance.native_frames, 60); assert.equal(report.performance.frame_pacing.count, 2);
  assert.match(report.performance.frame_pacing.method, /opportunities.*not.*rendered FPS/i);
  assert.equal(report.performance.input_response, 'Human supplied software observation');
}));

test('changed or unavailable finish identity cannot qualify otherwise sufficient software measurements', async () => {
  for (const changed of [true, false]) await using(async (h) => {
    await h.start(); await h.advance(601000, nativeAfter(h, 601));
    if (changed) h.setManifest({ ...h.manifest(), buildId: 'c'.repeat(40), source_commit: 'c'.repeat(40) });
    else h.setManifestAvailable(false);
    const report = await h.recorder.finish(); assert.equal(report.manifest_unchanged, false);
    assert.equal(report.coverage_complete, false); assert.equal(report.performance.duration_requirement_met, false);
    assert.equal(report.performance.speed_requirement_met, false); assert.equal(report.release_ready, false);
  });
});

test('manifest rejection is recoverable and disposed/finished recorders remove polling and event listeners', async () => using(async (h) => {
  h.setManifest({ ...h.manifest(), version: '0.3.0' }); await assert.rejects(h.recorder.prepare(), /version|runtime/i);
  h.setManifest(h.manifest()); await h.recorder.prepare(); await h.recorder.start();
  assert.ok(h.timers.size > 0); assert.ok(h.frames.size > 0); assert.ok(h.document.listeners.size + h.window.listeners.size > 0);
  await h.recorder.finish(); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
  assert.equal(h.document.listeners.size + h.window.listeners.size, 0);
  h.recorder.dispose(); await assert.rejects(h.recorder.prepare(), /disposed/);
}));

test('failed preparation after a completed run cannot export that old measurement as a new session', async () => using(async (h) => {
  await h.start(); await h.advance(1000, nativeAfter(h, 1)); await h.recorder.finish();
  h.setManifestAvailable(false); await assert.rejects(h.recorder.prepare(), /unavailable/);
  await assert.rejects(h.recorder.finish(), /No measurement/);
  h.setManifestAvailable(true); await h.recorder.prepare(); await h.recorder.start();
  await h.advance(1000, nativeAfter(h, 1)); const report = await h.recorder.finish();
  assert.equal(report.performance.wall_seconds, 1); assert.equal(report.samples.length, 2);
}));

test('missing, NaN, string and fractional observation counters cannot become apparently complete evidence', async () => {
  for (const patch of [
    { audio: { ...nativeState().audio, underruns: undefined } }, { audio: { ...nativeState().audio, underruns: NaN } },
    { audio: { ...nativeState().audio, scheduledSamples: '100' } }, { audio: { ...nativeState().audio, underruns: .5 } },
    { worker: { wasmMemoryCapacityBytes: NaN } }, { runN: '0' }, { timePs: '1.2' }, { identity: undefined },
  ]) await using(async (h) => {
    await h.start(); await h.advance(601000, { ...nativeAfter(h, 601), ...patch });
    const report = await h.recorder.finish(); assert.equal(report.coverage_complete, false);
    assert.equal(report.performance.duration_requirement_met, false); assert.equal(report.performance.speed_requirement_met, false);
    assert.ok(report.collection_errors.length > 0);
  });
});

test('compile-keyed core URLs bypass old unkeyed identity and preserve a distinct Wasm cache key', () => {
  const js = 'a'.repeat(64), wasm = 'b'.repeat(64);
  const urls = createCoreAssetUrls('https://fixture.example/NoCPU/', js, wasm);
  assert.equal(urls.moduleUrl, `https://fixture.example/NoCPU/core/nocpu.js?nocpu_js_sha256=${js}&nocpu_wasm_sha256=${wasm}`);
  assert.equal(urls.wasmUrl, `https://fixture.example/NoCPU/core/nocpu.wasm?nocpu_wasm_sha256=${wasm}`);
  assert.equal(locateCoreAsset('nocpu.wasm', urls.moduleUrl), urls.wasmUrl);
  assert.equal(locateCoreAsset('unrelated.data', urls.moduleUrl), 'https://fixture.example/NoCPU/core/unrelated.data');
  assert.throws(() => createCoreAssetUrls('https://fixture.example/NoCPU/', 'invalid', wasm));
  assert.throws(() => locateCoreAsset('nocpu.wasm', 'https://fixture.example/NoCPU/core/nocpu.js'));
});

test('manifest inventory, entry identity and served JS/Wasm tamper fail preflight and can recover', async () => {
  for (const change of [
    (h) => h.setManifest({ ...h.manifest(), runtime_sha256: '0'.repeat(64) }),
    (h) => h.setManifest({ ...h.manifest(), runtime_files: h.manifest().runtime_files.filter((file) => file.path !== 'assets/entry.js') }),
    (h) => h.corruptAsset('core/nocpu.js', 'old cached loader'),
    (h) => h.corruptAsset('core/nocpu.wasm', Buffer.from('old cached wasm')),
    (h) => h.corruptAsset('assets/entry.js', 'wrong app entry'),
  ]) await using(async (h) => {
    change(h); await assert.rejects(h.recorder.prepare(), /identity|inventory|digest|manifest/i);
    assert.equal(h.recorder.status().phase, 'error'); await assert.rejects(h.recorder.start(), /Prepare/);
  });
  await using(async (h) => {
    h.setManifest({ ...h.manifest(), runtime_sha256: '0'.repeat(64) }); await assert.rejects(h.recorder.prepare());
    h.setManifest(h.manifest()); await h.recorder.prepare(); await h.recorder.start();
    const report = await h.recorder.finish(); assert.equal(report.manifest_start.served_runtime_verified, true);
    assert.match(report.manifest_start.scope, /no loaded-memory.*physical-device/i);
    assert.ok(h.requests.some((request) => request.url.includes('nocpu_js_sha256=')));
    assert.ok(h.requests.some((request) => /nocpu\.wasm\?nocpu_wasm_sha256=/.test(request.url)));
    assert.ok(!h.requests.some((request) => /nocpu\.(?:js|wasm)$/.test(request.url)));
  });
});

test('a query settling after Finish remains excluded and polling cannot overlap or append out of order', async () => using(async (h) => {
  await h.start(); const pending = h.deferSnapshot();
  await h.advance(1000); assert.equal(h.snapshotCount(), 2);
  assert.equal([...h.timers.values()].filter((timer) => timer.delay === 1000).length, 0);
  const finishing = h.recorder.finish(); assert.equal(h.recorder.status().phase, 'finishing');
  h.stepWall(2000); pending.resolve({ ...h.state(), ...nativeAfter(h, 3) });
  const report = await finishing;
  assert.equal(report.performance.session_seconds, 1); assert.equal(report.performance.wall_seconds, 0);
  assert.equal(report.excluded_intervals[0].reason, 'finish_crossing_query');
  assert.equal(report.samples.length, 2); assert.equal(h.snapshotCount(), 2);
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
}));

test('native transition callbacks split rapid game-over and re-coin between observation polls', async () => using(async (h) => {
  h.recorder.boundary('inactive setup'); await h.start();
  h.recorder.boundary('native_game_over'); h.recorder.boundary('insert_coin');
  await h.advance(1000, nativeAfter(h, 1)); await h.advance(1000, nativeAfter(h, 1));
  const report = await h.recorder.finish(); assert.equal(report.performance.wall_seconds, 1);
  assert.deepEqual(report.events.map((event) => event.reason), ['native_game_over', 'insert_coin']);
  assert.equal(report.excluded_intervals[0].reason, 'foreground_boundary');
}));

test('post-finish manual annotation cannot alter immutable measurement evidence or auto-pass required checks', async () => using(async (h) => {
  await h.start(); await h.advance(1000, nativeAfter(h, 1)); const report = await h.recorder.finish();
  const numeric = JSON.stringify({ samples: report.samples, segments: report.segments, performance: report.performance });
  const annotated = annotateQualificationReport(report, { physical: false, model: 'Synthetic host', observations: { input_response: 'Observed only by a person', audible_circuit_sound: true }, notes: 'No hardware result' });
  assert.equal(annotated.device.physical, false); assert.equal(annotated.device.model, 'Synthetic host');
  assert.equal(annotated.performance.input_response, 'Observed only by a person');
  assert.equal(annotated.observations.audible_circuit_sound, undefined); assert.equal(annotated.release_ready, false);
  assert.equal(JSON.stringify({ samples: report.samples, segments: report.segments, performance: report.performance }), numeric);
  assert.equal(annotated.samples, report.samples); assert.equal(annotated.segments, report.segments);
  assert.ok(Object.isFrozen(annotated)); assert.ok(Object.isFrozen(annotated.samples[0].state));
  const originalWall = annotated.performance.wall_seconds; annotated.performance.wall_seconds = 600;
  assert.equal(annotated.performance.wall_seconds, originalWall);
}));

test('sample capacity stops collection honestly and does not qualify an incomplete long session', async () => using(async (h) => {
  await h.start();
  for (let sample = 1; sample < 7200; sample++) await h.advance(1000, nativeAfter(h, 1));
  assert.equal(h.recorder.status().phase, 'error'); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
  const report = await h.recorder.finish(); assert.equal(report.samples.length, 7200);
  assert.ok(report.performance.wall_seconds >= 600); assert.equal(report.coverage_complete, false);
  assert.equal(report.performance.duration_requirement_met, false); assert.equal(report.performance.speed_requirement_met, false);
  assert.match(report.collection_errors.join(' '), /capacity/i);
}));

test('actual Vite compile pins reject inconsistent provenance and core changes before or during a build', async () => {
  const { loadConfigFromFile } = await import('vite');
  async function fixture(callback) {
    const directory = fs.mkdtempSync(path.join(root, 'build/qualification-provenance-test-'));
    try {
      const needed = ['VERSION', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'web',
        'tests/fflate-source-manifest.json', 'tests/fixtures/game-manifest.json', 'upstream/fflate-0.8.2',
        'node_modules/fflate', 'docs/licenses/fflate-0.8.2-LICENSE.txt'];
      for (const name of needed) { fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true }); fs.cpSync(path.join(root, name), path.join(directory, name), { recursive: true }); }
      // A clean checkout has no generated core. Use explicit synthetic bytes;
      // these probes exercise config safeguards, never a circuit build/play claim.
      const generated = path.join(directory, 'web/public/core'); fs.mkdirSync(generated, { recursive: true });
      const js = Buffer.from('export default function syntheticCore() {}');
      const wasm = Buffer.from('0061736d01000000', 'hex');
      fs.writeFileSync(path.join(generated, 'nocpu.js'), js); fs.writeFileSync(path.join(generated, 'nocpu.wasm'), wasm);
      fs.mkdirSync(path.join(directory, 'build/core/wasm'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'build/core/wasm/build-provenance.json'), JSON.stringify({ target: 'wasm', outputs: { 'nocpu.js': sha256(js), 'nocpu.wasm': sha256(wasm) } }));
      const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, path.join(directory, 'vite.config.ts'), directory);
      assert.ok(loaded); const plugin = loaded.config.plugins.find((item) => item.name === 'nocpu-build-provenance');
      assert.equal(JSON.parse(loaded.config.define.__NOCPU_CORE_JS_SHA256__), sha256(fs.readFileSync(path.join(directory, 'web/public/core/nocpu.js'))));
      assert.equal(JSON.parse(loaded.config.define.__NOCPU_CORE_WASM_SHA256__), sha256(fs.readFileSync(path.join(directory, 'web/public/core/nocpu.wasm'))));
      await callback(directory, plugin);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
  await fixture(async (directory, plugin) => {
    fs.appendFileSync(path.join(directory, 'web/public/core/nocpu.js'), '\nchanged after define');
    assert.throws(() => plugin.buildStart(), /Core bytes changed/);
  });
  await fixture(async (directory, plugin) => {
    const file = path.join(directory, 'build/core/wasm/build-provenance.json'); const provenance = JSON.parse(fs.readFileSync(file));
    provenance.outputs['nocpu.wasm'] = '0'.repeat(64); fs.writeFileSync(file, JSON.stringify(provenance));
    assert.throws(() => plugin.buildStart(), /Wasm build provenance/);
  });
  await fixture(async (directory, plugin) => {
    plugin.buildStart(); fs.appendFileSync(path.join(directory, 'web/public/core/nocpu.wasm'), '\nchanged during build');
    assert.throws(() => plugin.closeBundle(), /Core bytes changed/);
  });
  await fixture(async (directory, plugin) => {
    plugin.buildStart(); fs.appendFileSync(path.join(directory, 'build/core/wasm/build-provenance.json'), '\n');
    assert.throws(() => plugin.closeBundle(), /Core provenance changed/);
  });
});
