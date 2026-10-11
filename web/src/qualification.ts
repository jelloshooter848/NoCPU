// Optional device measurement, GPL-3.0-or-later. No circuit or playback controls.
import { CORE_JS_QUERY, CORE_WASM_QUERY, createCoreAssetUrls } from './asset-identity';
import type { QualificationAssetIdentity } from './asset-identity';
import { isGameOptions, isPlayableGameId, normalizeGameOptions, type GameOptions, type PlayableGameId } from './game-contract';
export interface QualificationIdentity {
  generation: number;
  resetId: number;
  clockEpoch: number;
  resetting: boolean;
  ready: boolean;
  failed: boolean;
}

export interface QualificationSnapshot {
  gameId: PlayableGameId;
  gameOptions: GameOptions;
  nativeRunning: boolean;
  timePs: string;
  frame: number;
  runN: number;
  attractN: number | null;
  paused: boolean;
  screen: string;
  identityBefore: QualificationIdentity;
  identity: QualificationIdentity;
  audio: {
    generatedSamples: number;
    coreOverruns: number;
    transportDroppedSamples: number;
    [key: string]: number | string;
  };
  worker: { wasmMemoryCapacityBytes: number; [key: string]: number };
}

export interface QualificationMetadata {
  physical?: boolean | null;
  platform?: string;
  model?: string;
  osVersion?: string;
  browser?: string;
  browserVersion?: string;
  controller?: string;
  observations?: Record<string, string>;
  notes?: string;
}

export interface QualificationStatus {
  phase: 'idle' | 'preparing' | 'prepared' | 'starting' | 'recording' | 'finishing' | 'complete' | 'error';
  activeWallSeconds: number;
  activeWallLowerBoundSeconds: number;
  error: string | null;
}

interface Sample {
  before_ms: number;
  after_ms: number;
  wall_midpoint_ms: number;
  query_roundtrip_ms: number;
  boundary_before: number;
  boundary_after: number;
  visible: boolean;
  focused: boolean;
  state: QualificationSnapshot;
}

interface Segment {
  from_sample: number;
  to_sample: number;
  wall_seconds: number;
  simulation_seconds: number;
  timing_uncertainty_seconds: number;
  native_frames: number;
  audio_deltas: Record<string, number>;
}

interface ManifestIdentity {
  version: string;
  build_id: string;
  source_commit: string;
  stage: string;
  runtime_sha256: string;
  manifest_sha256: string;
  manifest_url: string;
  manifest_bytes: string;
  loaded_asset_urls: string[];
  keyed_core_module_url: string;
  keyed_core_wasm_url: string;
  served_runtime_files: { path: string; sha256: string; size: number }[];
  served_runtime_verified: boolean;
  scope: string;
}

export interface QualificationReport {
  schema_version: number;
  game: { id: PlayableGameId; options: GameOptions } | null;
  game_consistent: boolean;
  game_sessions: { id: PlayableGameId; options: GameOptions; generation: number }[];
  native_run_scope: string;
  scope: string;
  release_ready: false;
  tested_at: string;
  finished_at: string;
  device: {
    physical: boolean | null;
    platform: string | null;
    model: string | null;
    os_version: string | null;
    browser: string | null;
    browser_version: string | null;
    controller: string | null;
  };
  observations: Record<string, string>;
  notes: string | null;
  manifest_start: ManifestIdentity;
  manifest_end: ManifestIdentity | null;
  manifest_unchanged: boolean;
  coverage_complete: boolean;
  collection_errors: string[];
  performance: {
    session_seconds: number;
    wall_seconds: number;
    active_wall_seconds: number;
    active_wall_lower_bound_seconds: number;
    simulation_seconds: number;
    simulation_speed_ratio: number | null;
    conservative_simulation_speed_ratio: number | null;
    timing_uncertainty_seconds: number;
    duration_requirement_met: boolean;
    speed_requirement_met: boolean;
    duration_scope: string;
    frame_pacing: Record<string, number | string | boolean | null>;
    native_frames: number;
    audio_underruns: number;
    audio_deltas: Record<string, number>;
    audio_counter_scope: string;
    excluded_audio_deltas: Record<string, number> | null;
    initial_audio_counters: Record<string, number> | null;
    memory_start_bytes: number | null;
    memory_end_bytes: number | null;
    memory_scope: string;
    input_response: string | null;
  };
  samples: Sample[];
  segments: Segment[];
  excluded_intervals: { from_sample: number; to_sample: number; wall_seconds: number; reason: string }[];
  events: { wall_ms: number; reason: string; boundary: number }[];
  privacy: string;
}

export interface QualificationRecorderOptions {
  snapshot: () => Promise<QualificationSnapshot>;
  manifestUrl: string;
  expectedVersion: string;
  assetIdentity: QualificationAssetIdentity;
  activity?: () => boolean;
  onStatus?: (status: QualificationStatus) => void;
  // Dependencies may be injected by focused tests; the UI supplies none of them.
  now?: () => number;
  environment?: () => { visible: boolean; focused: boolean };
  fetch?: typeof fetch;
}

const AUDIO_COUNTERS = ['generatedSamples', 'scheduledSamples', 'underruns', 'discardedQueues',
  'coreOverruns', 'transportDroppedSamples'] as const;
const MAX_SAMPLES = 7200;
const MAX_PACING = 120000;
const MAX_EVENTS = 10000;
const MIN_SECONDS = 600;
const MIN_RATIO = .95;
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const text = (value: string | undefined, maximum = 512): string | null => value?.trim().slice(0, maximum) || null;
const sameIdentity = (a: QualificationIdentity, b: QualificationIdentity): boolean =>
  a.generation === b.generation && a.resetId === b.resetId && a.clockEpoch === b.clockEpoch
  && a.resetting === b.resetting && a.ready === b.ready && a.failed === b.failed;

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}

export function annotateQualificationReport(report: QualificationReport, metadata: QualificationMetadata): QualificationReport {
  const observations = Object.fromEntries(Object.entries(metadata.observations ?? {}).slice(0, 32)
    .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
    .map(([key, value]) => [key.slice(0, 128), value.slice(0, 4096)]));
  return freeze({ ...report,
    device: { physical: metadata.physical ?? null, platform: text(metadata.platform), model: text(metadata.model),
      os_version: text(metadata.osVersion), browser: text(metadata.browser), browser_version: text(metadata.browserVersion), controller: text(metadata.controller) },
    observations, notes: text(metadata.notes, 4096),
    performance: { ...report.performance, input_response: observations.input_response ?? null } });
}

function cleanSnapshot(value: QualificationSnapshot): QualificationSnapshot {
  if (!isPlayableGameId(value.gameId) || !isGameOptions(value.gameId, value.gameOptions)
    || typeof value.nativeRunning !== 'boolean' || value.runN !== Number(!value.nativeRunning)
    || (value.gameId === 'spacerace' ? value.attractN !== null : ![0, 1].includes(value.attractN as number))
    || !/^\d+$/.test(value.timePs) || !Number.isSafeInteger(value.frame) || value.frame < 0
    || ![0, 1].includes(value.runN)
    || typeof value.paused !== 'boolean' || typeof value.screen !== 'string') {
    throw new Error('Invalid native clock or frame observation.');
  }
  for (const identity of [value.identityBefore, value.identity]) {
    if (!identity || !['generation', 'resetId', 'clockEpoch'].every((key) => Number.isSafeInteger(identity[key as keyof QualificationIdentity]))
      || !['resetting', 'ready', 'failed'].every((key) => typeof identity[key as keyof QualificationIdentity] === 'boolean')) {
      throw new Error('Missing native session identity.');
    }
  }
  const audio: QualificationSnapshot['audio'] = { contextState: String(value.audio.contextState),
    queueDepth: value.audio.queueDepth, queuedMs: value.audio.queuedMs,
    generatedSamples: 0, scheduledSamples: 0, underruns: 0, discardedQueues: 0, coreOverruns: 0, transportDroppedSamples: 0 };
  for (const key of AUDIO_COUNTERS) {
    if (!Number.isSafeInteger(value.audio[key]) || Number(value.audio[key]) < 0) throw new Error(`Invalid audio counter (${key}).`);
    audio[key] = Number(value.audio[key]);
  }
  if (typeof value.audio.contextState !== 'string' || !Number.isSafeInteger(value.audio.queueDepth) || Number(value.audio.queueDepth) < 0
    || typeof value.audio.queuedMs !== 'number' || !Number.isFinite(value.audio.queuedMs) || value.audio.queuedMs < 0
    || !Number.isSafeInteger(value.worker.wasmMemoryCapacityBytes) || value.worker.wasmMemoryCapacityBytes <= 0) {
    throw new Error('Invalid audio or Wasm capacity observation.');
  }
  // Raw evidence intentionally excludes key codes, axes, saved settings, ROM
  // metadata, controller identifiers and unrelated debug properties.
  const identity = (item: QualificationIdentity): QualificationIdentity => ({ generation: item.generation,
    resetId: item.resetId, clockEpoch: item.clockEpoch, ready: item.ready, resetting: item.resetting, failed: item.failed });
  return { gameId: value.gameId, gameOptions: normalizeGameOptions(value.gameId, value.gameOptions), nativeRunning: value.nativeRunning,
    timePs: value.timePs, frame: value.frame, runN: value.runN, attractN: value.attractN,
    paused: value.paused, screen: value.screen,
    identityBefore: identity(value.identityBefore), identity: identity(value.identity), audio,
    worker: { wasmMemoryCapacityBytes: value.worker.wasmMemoryCapacityBytes } };
}

export function createQualificationRecorder(options: QualificationRecorderOptions) {
  const now = options.now ?? (() => performance.now());
  const environment = options.environment ?? (() => ({ visible: !document.hidden, focused: document.hasFocus() }));
  let phase: QualificationStatus['phase'] = 'idle';
  let prepared: ManifestIdentity | undefined;
  let startManifest: ManifestIdentity;
  let startWall = 0;
  let stopWall = 0;
  let startedAt = '';
  let finishedAt = '';
  let boundary = 0;
  let disposed = false;
  let sessionOpen = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let animation: number | undefined;
  let lastAnimation: number | undefined;
  let pending: Promise<void> | undefined;
  let previous: Sample | undefined;
  let cleanup: (() => void)[] = [];
  let samples: Sample[] = [];
  let segments: Segment[] = [];
  let excluded: QualificationReport['excluded_intervals'] = [];
  let events: QualificationReport['events'] = [];
  let errors: string[] = [];
  let pacing: number[] = [];

  const totals = () => segments.reduce((value, segment) => ({ wall: value.wall + segment.wall_seconds,
    sim: value.sim + segment.simulation_seconds, uncertainty: value.uncertainty + segment.timing_uncertainty_seconds }),
  { wall: 0, sim: 0, uncertainty: 0 });
  const status = (): QualificationStatus => {
    const measured = totals();
    return { phase, activeWallSeconds: measured.wall,
      activeWallLowerBoundSeconds: Math.max(0, measured.wall - measured.uncertainty), error: errors.at(-1) ?? null };
  };
  function publish() { try { options.onStatus?.(status()); } catch { /* A UI callback cannot change measurement evidence. */ } }
  function fail(error: unknown) { if (errors.length < 32) errors.push(message(error).slice(0, 1024)); publish(); }
  function recordEvent(reason: string) {
    if (events.length >= MAX_EVENTS) { fail('Event capacity reached; measurement coverage is incomplete.'); return; }
    events.push({ wall_ms: now(), reason: reason.slice(0, 128), boundary });
  }
  function noteBoundary(reason: string) {
    if (phase !== 'recording' && phase !== 'finishing') return;
    boundary += 1;
    lastAnimation = undefined;
    recordEvent(reason);
  }
  function subscribe() {
    const listen = (target: EventTarget, type: string, callback: () => void) => {
      target.addEventListener(type, callback);
      cleanup.push(() => target.removeEventListener(type, callback));
    };
    listen(document, 'visibilitychange', () => noteBoundary(document.hidden ? 'hidden' : 'visible'));
    for (const type of ['blur', 'focus', 'pagehide']) listen(window, type, () => noteBoundary(type));
    listen(window, 'resize', () => recordEvent('resize'));
  }
  function stop() {
    clearTimeout(timeout); timeout = undefined;
    if (animation !== undefined) cancelAnimationFrame(animation);
    animation = undefined;
    for (const remove of cleanup) remove();
    cleanup = [];
  }
  async function readManifest(): Promise<ManifestIdentity> {
    const url = new URL(options.manifestUrl, location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== location.origin) {
      throw new Error('The build manifest must use this page’s HTTP(S) origin.');
    }
    const response = await (options.fetch ?? fetch)(url.href, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Build manifest unavailable (${response.status}).`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 262144) throw new Error('Build manifest is unexpectedly large.');
    const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(contents) as Record<string, unknown>;
    if (value.schema_version !== 1 || value.project !== 'NoCPU' || value.version !== options.expectedVersion
      || !['preview', 'release'].includes(String(value.stage)) || !/^[0-9a-f]{40}$/.test(String(value.buildId))
      || !/^[0-9a-f]{40}$/.test(String(value.source_commit)) || !/^[0-9a-f]{64}$/.test(String(value.runtime_sha256))) {
      throw new Error('Build manifest does not identify this app version and runtime.');
    }
    const hash = async (data: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const digest = await hash(bytes);
    const runtime = value.runtime_files as { path: string; sha256: string; size: number }[];
    if (!Array.isArray(runtime) || runtime.length < 3 || runtime.length > 32
      || runtime.some((file) => !file || !/^[A-Za-z0-9._/-]+$/.test(file.path)
        || file.path.split('/').some((part) => !part || part === '.' || part === '..')
        || !/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0)
      || new Set(runtime.map((file) => file.path)).size !== runtime.length
      || runtime.reduce((sum, file) => sum + file.size, 0) > 16777216) {
      throw new Error('Invalid runtime-file inventory in build manifest.');
    }
    const identity = options.assetIdentity;
    const module = new URL(identity.moduleUrl);
    const wasm = new URL(identity.wasmUrl);
    const entry = new URL(identity.entryUrl);
    const expected = createCoreAssetUrls(new URL('.', url).href, identity.coreJsSha256, identity.coreWasmSha256);
    if (module.href !== expected.moduleUrl || wasm.href !== expected.wasmUrl || entry.origin !== url.origin
      || !runtime.some((file) => new URL(file.path, url).href === entry.href)
      || runtime.find((file) => file.path === 'core/nocpu.js')?.sha256 !== module.searchParams.get(CORE_JS_QUERY)
      || runtime.find((file) => file.path === 'core/nocpu.wasm')?.sha256 !== wasm.searchParams.get(CORE_WASM_QUERY)) {
      throw new Error('Loaded app entry or compiled core identity does not match the build manifest.');
    }
    const sorted = [...runtime].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      .map((file) => ({ path: file.path, sha256: file.sha256, size: file.size }));
    if (await hash(new TextEncoder().encode(JSON.stringify(sorted)).buffer) !== value.runtime_sha256) {
      throw new Error('Manifest runtime inventory does not match its complete digest.');
    }
    await Promise.all(sorted.map(async (file) => {
      const assetUrl = file.path === 'core/nocpu.js' ? module.href
        : file.path === 'core/nocpu.wasm' ? wasm.href : new URL(file.path, url).href;
      const asset = await (options.fetch ?? fetch)(assetUrl, { cache: 'no-store' });
      if (!asset.ok) throw new Error(`Runtime asset unavailable (${file.path}).`);
      const payload = await asset.arrayBuffer();
      if (payload.byteLength !== file.size || await hash(payload) !== file.sha256) {
        throw new Error(`Served runtime asset does not match manifest (${file.path}).`);
      }
    }));
    return { version: String(value.version), build_id: String(value.buildId), source_commit: String(value.source_commit),
      stage: String(value.stage), runtime_sha256: String(value.runtime_sha256),
      manifest_sha256: digest,
      manifest_url: url.href, manifest_bytes: contents,
      loaded_asset_urls: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((script) => script.src),
      keyed_core_module_url: module.href, keyed_core_wasm_url: wasm.href, served_runtime_files: sorted, served_runtime_verified: true,
      scope: 'No-store manifest bytes/hash and served-runtime hashes/digest match the loaded entry URL and compiled SHA-keyed core requests. Supplemented by independent preview verification; no loaded-memory byte hash or physical-device inference.' };
  }
  function active(sample: Sample): boolean {
    const state = sample.state;
    return sample.visible && sample.focused && state.screen === 'playing' && !state.paused
      && state.nativeRunning && state.runN === 0 && (state.gameId === 'spacerace' || state.attractN === 1) && state.identity.ready && !state.identity.failed && !state.identity.resetting;
  }
  async function readSample(): Promise<Sample> {
    const before = now();
    const boundaryBefore = boundary;
    const beforeEnvironment = environment();
    const state = cleanSnapshot(await options.snapshot());
    const after = now();
    const afterEnvironment = environment();
    if (!Number.isFinite(before) || !Number.isFinite(after) || after < before) throw new Error('Wall clock regressed.');
    return { before_ms: before, after_ms: after, wall_midpoint_ms: (before + after) / 2,
      query_roundtrip_ms: after - before, boundary_before: boundaryBefore, boundary_after: boundary,
      visible: beforeEnvironment.visible && afterEnvironment.visible,
      focused: beforeEnvironment.focused && afterEnvironment.focused, state };
  }
  function append(sample: Sample) {
    const index = samples.length;
    samples.push(sample);
    if (previous) {
      const wall = (sample.wall_midpoint_ms - previous.wall_midpoint_ms) / 1000;
      let reason: string | undefined;
      if (phase === 'finishing' && sample.after_ms > stopWall) reason = 'finish_crossing_query';
      else if (sample.boundary_before !== sample.boundary_after || previous.boundary_before !== previous.boundary_after
        || sample.boundary_after !== previous.boundary_after) reason = 'foreground_boundary';
      else if (previous.state.gameId !== sample.state.gameId
        || JSON.stringify(previous.state.gameOptions) !== JSON.stringify(sample.state.gameOptions)) reason = 'game_or_settings_boundary';
      else if (!sameIdentity(previous.state.identityBefore, previous.state.identity)
        || !sameIdentity(sample.state.identityBefore, sample.state.identity)
        || !sameIdentity(previous.state.identity, sample.state.identity)) reason = 'generation_reset_or_clock_boundary';
      else if (!active(previous) || !active(sample)) reason = 'not_native_running_foreground_play';
      else if (wall <= 0) { reason = 'wall_clock_regression'; fail('Nonmonotonic active wall observation.'); }
      else if (BigInt(sample.state.timePs) < BigInt(previous.state.timePs) || sample.state.frame < previous.state.frame) {
        reason = 'unexplained_native_regression'; fail('Native clock/frame regressed without a recorded session boundary.');
      }
      const deltas = Object.fromEntries(AUDIO_COUNTERS.map((key) => [key, Number(sample.state.audio[key]) - Number(previous!.state.audio[key])]));
      if (!reason && Object.values(deltas).some((delta) => delta < 0)) {
        reason = 'unexplained_audio_counter_regression'; fail('Audio counters regressed during active play.');
      }
      if (reason) excluded.push({ from_sample: index - 1, to_sample: index, wall_seconds: Math.max(0, wall), reason });
      else {
        // Long gaps remain inside the active interval: dropping them would hide
        // stalls. A failed request also preserves the previous native endpoint.
        let segment = segments.at(-1);
        if (!segment || segment.to_sample !== index - 1) {
          segment = { from_sample: index - 1, to_sample: index - 1, wall_seconds: 0,
            simulation_seconds: 0, timing_uncertainty_seconds: 0, native_frames: 0,
            audio_deltas: Object.fromEntries(AUDIO_COUNTERS.map((key) => [key, 0])) };
          segments.push(segment);
        }
        segment.to_sample = index;
        segment.wall_seconds += wall;
        segment.simulation_seconds += Number(BigInt(sample.state.timePs) - BigInt(previous.state.timePs)) / 1e12;
        segment.timing_uncertainty_seconds = (samples[segment.from_sample].query_roundtrip_ms + sample.query_roundtrip_ms) / 2000;
        segment.native_frames += sample.state.frame - previous.state.frame;
        for (const key of AUDIO_COUNTERS) segment.audio_deltas[key] += deltas[key];
      }
    }
    previous = sample;
  }
  function poll(): Promise<void> {
    if (disposed || phase !== 'recording') return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      try {
        if (samples.length >= MAX_SAMPLES) throw new Error('Measurement capacity reached; finish and export this incomplete run.');
        const sample = await readSample();
        if (!disposed) append(sample);
      } catch (error) { if (!disposed) fail(error); }
      finally {
        pending = undefined;
        if (!disposed) publish();
        if (phase === 'recording' && !disposed && samples.length < MAX_SAMPLES) timeout = setTimeout(() => { void poll(); }, 1000);
        else if (phase === 'recording' && samples.length >= MAX_SAMPLES) {
          fail('Measurement sample capacity reached; subsequent session coverage is incomplete.');
          phase = 'error'; stop(); publish();
        }
      }
    })();
    return pending;
  }
  function frame(at: number) {
    if (disposed || phase !== 'recording') return;
    const foreground = environment();
    const eligible = foreground.visible && foreground.focused && previous && active(previous)
      && (options.activity?.() ?? true);
    if (eligible) {
      if (lastAnimation !== undefined && pacing.length < MAX_PACING) pacing.push(at - lastAnimation);
      lastAnimation = at;
    } else lastAnimation = undefined;
    animation = requestAnimationFrame(frame);
  }
  function pacingReport(): QualificationReport['performance']['frame_pacing'] {
    const sorted = [...pacing].sort((a, b) => a - b);
    const quantile = (fraction: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null;
    return { method: 'requestAnimationFrame callback opportunities during foreground, currently active app and latest sampled native-running play; not simulation FPS, rendered FPS, display refresh or input-to-photon latency.',
      count: sorted.length, p50_ms: quantile(.5), p95_ms: quantile(.95), p99_ms: quantile(.99), max_ms: sorted.at(-1) ?? null,
      intervals_over_50_ms: sorted.filter((value) => value > 50).length, capped: pacing.length >= MAX_PACING };
  }
  return {
    status,
    boundary: noteBoundary,
    async prepare(): Promise<void> {
      if (disposed) throw new Error('Measurement recorder has been disposed.');
      if (sessionOpen || ['recording', 'starting', 'finishing', 'preparing'].includes(phase)) throw new Error('Measurement recorder is busy.');
      phase = 'preparing'; errors = []; prepared = undefined; publish();
      try { prepared = await readManifest(); if (!disposed) { phase = 'prepared'; publish(); } }
      catch (error) { if (!disposed) { fail(error); phase = 'error'; publish(); } throw error; }
    },
    async start(): Promise<void> {
      if (disposed || !prepared || !['prepared', 'complete'].includes(phase)) throw new Error('Prepare build identity before starting measurement.');
      phase = 'starting'; publish();
      samples = []; segments = []; excluded = []; events = []; errors = []; pacing = [];
      previous = undefined; lastAnimation = undefined; boundary = 0;
      startManifest = prepared; prepared = undefined;
      sessionOpen = true;
      startWall = now(); startedAt = new Date().toISOString();
      subscribe();
      phase = 'recording'; publish();
      animation = requestAnimationFrame(frame);
      await poll();
    },
    async finish(metadata: QualificationMetadata = {}): Promise<QualificationReport> {
      if (disposed || !sessionOpen || !['recording', 'error'].includes(phase) || !startManifest) throw new Error('No measurement is running.');
      phase = 'finishing'; stopWall = now(); finishedAt = new Date().toISOString(); stop(); publish();
      // Serialize the one outstanding query. Never issue a fake active endpoint
      // after the menu has paused play, or append concurrent queries out of order.
      await pending;
      let end: ManifestIdentity | null = null;
      try { end = await readManifest(); } catch (error) { fail(error); }
      const unchanged = Boolean(end && end.manifest_sha256 === startManifest.manifest_sha256);
      if (!unchanged) fail('Build manifest changed or could not be rechecked; runtime association is stale.');
      const measured = totals();
      const nominalRatio = measured.wall > 0 ? measured.sim / measured.wall : null;
      const conservativeRatio = measured.wall > 0 ? measured.sim / (measured.wall + measured.uncertainty) : null;
      const audio = Object.fromEntries(AUDIO_COUNTERS.map((key) => [key, segments.reduce((sum, item) => sum + item.audio_deltas[key], 0)]));
      const first = segments.length ? samples[segments[0].from_sample] : samples[0];
      const last = segments.length ? samples[segments.at(-1)!.to_sample] : samples.at(-1);
      const counterDiscontinuity = samples.some((sample, index) => index > 0
        && (sample.state.identity.generation !== samples[index - 1].state.identity.generation
          || AUDIO_COUNTERS.some((key) => Number(sample.state.audio[key]) < Number(samples[index - 1].state.audio[key]))));
      const allAudio = samples.length > 1 && !counterDiscontinuity ? Object.fromEntries(AUDIO_COUNTERS.map((key) =>
        [key, Number(samples.at(-1)!.state.audio[key]) - Number(samples[0].state.audio[key]) - audio[key]])) : null;
      const initialAudio = samples[0] ? Object.fromEntries(AUDIO_COUNTERS.map((key) => [key, Number(samples[0].state.audio[key])])) : null;
      const initialGame = samples[0] ? { id: samples[0].state.gameId, options: structuredClone(samples[0].state.gameOptions) } : null;
      const gameConsistent = Boolean(initialGame && samples.every((sample) => sample.state.gameId === initialGame.id
        && JSON.stringify(sample.state.gameOptions) === JSON.stringify(initialGame.options)));
      const gameSessions = [...new Map(samples.map((sample) => [
        `${sample.state.identity.generation}:${sample.state.gameId}:${JSON.stringify(sample.state.gameOptions)}`,
        { id: sample.state.gameId, options: structuredClone(sample.state.gameOptions), generation: sample.state.identity.generation },
      ])).values()];
      if (!gameConsistent) fail('The recording changed game or game settings, or has no identified circuit. Record each game separately.');
      const complete = errors.length === 0 && samples.length > 1 && unchanged && gameConsistent;
      const report: QualificationReport = {
        schema_version: 1, game: initialGame, game_consistent: gameConsistent, game_sessions: gameSessions,
        native_run_scope: 'runN is the normalized inverse of nativeRunning. Pong uses its original RUN_n and ATTRACT_n signals. Pong Doubles uses original ATTRACT_n (D2.4) for game-active status. Space Race uses the original GAME_ON timer signal (C9.3), preserving its inherited coin/start behavior; it has no equivalent ATTRACT signal, so attractN is null. Breakout uses original ATTRACT_n (E6.9) for game-active status; its raw credit Q_n is a separate signal. No activity is inferred from input events or displayed scores.',
        scope: 'Instrumented measurement only. Human device identity, speaker/touch/lifecycle observations and independent artifact verification remain required.',
        release_ready: false, tested_at: startedAt, finished_at: finishedAt,
        device: { physical: metadata.physical ?? null, platform: text(metadata.platform), model: text(metadata.model),
          os_version: text(metadata.osVersion), browser: text(metadata.browser), browser_version: text(metadata.browserVersion), controller: text(metadata.controller) },
        observations: {}, notes: null, manifest_start: startManifest, manifest_end: end,
        manifest_unchanged: unchanged, coverage_complete: complete, collection_errors: [...errors],
        performance: { session_seconds: Math.max(0, (stopWall - startWall) / 1000), wall_seconds: measured.wall,
          active_wall_seconds: measured.wall, active_wall_lower_bound_seconds: Math.max(0, measured.wall - measured.uncertainty),
          simulation_seconds: measured.sim, simulation_speed_ratio: nominalRatio,
          conservative_simulation_speed_ratio: conservativeRatio, timing_uncertainty_seconds: measured.uncertainty,
          duration_requirement_met: complete && measured.wall - measured.uncertainty >= MIN_SECONDS,
          speed_requirement_met: complete && conservativeRatio !== null && conservativeRatio >= MIN_RATIO,
          duration_scope: 'Aggregate one identified game with unchanged circuit settings; accepted intervals retain same-generation/reset/clock foreground native-running play. Menus, pause, hidden, attract and transition intervals excluded; stalls within eligible intervals remain counted.',
          frame_pacing: pacingReport(), native_frames: segments.reduce((sum, item) => sum + item.native_frames, 0),
          audio_underruns: audio.underruns, audio_deltas: audio,
          audio_counter_scope: 'Adapter/core differences over accepted active intervals. generatedSamples counts PCM received by the UI, not transport-discarded circuit PCM; scheduledSamples counts WebAudio submissions including gain-muted audio. underruns counts push-time output lead falling behind currentTime; discardedQueues counts lead-over-180ms flushes; coreOverruns and transportDroppedSamples are separate. Excluded deltas cover only the sampled session and are null across generation/counter discontinuity. Initial cumulative counters are a premeasurement baseline, not a startup measurement. No speaker or sound-accuracy claim.',
          excluded_audio_deltas: allAudio, initial_audio_counters: initialAudio,
          memory_start_bytes: first?.state.worker.wasmMemoryCapacityBytes ?? null,
          memory_end_bytes: last?.state.worker.wasmMemoryCapacityBytes ?? null,
          memory_scope: 'Allocated Wasm linear-memory capacity; not used heap, total browser-process memory or phone RAM.',
          input_response: null },
        samples: [...samples], segments: structuredClone(segments), excluded_intervals: [...excluded], events: [...events],
        privacy: 'Only supplied identity/observations (including optional controller model), build manifest, allowlisted circuit game ID/options, native clock/frame/session flags, audio counters and Wasm capacity. No automatic ROM payload/metadata, personal preferences or control mappings, key codes, axes, controller IDs, storage dumps, secrets or remote upload.' };
      sessionOpen = false; phase = 'complete'; publish();
      return annotateQualificationReport(report, metadata);
    },
    dispose(): void { disposed = true; sessionOpen = false; stop(); phase = 'idle'; },
  };
}
