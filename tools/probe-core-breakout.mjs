#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Challenge real ABI4 media/lifecycle against retained original Breakout output.
// The finite original rally must genuinely change brick RAM before warm reset.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const options = { module: 'build/core/wasm/nocpu.js', output: 'build/core/breakout-abi-probe.json', 'original-epoch': '', 'rally-epoch': '' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || !process.argv[i + 1]) throw new Error(`Unknown/incomplete option ${process.argv[i]}`);
  options[key] = process.argv[i + 1];
}
const report = { schema_version: 1, seed: 848, checks: [], traces: [], limitations: [
  'Finite ABI/input/reset/media proof; full original settings/gameplay and browser/physical device qualification remain separate.',
  'Contact counters retain startup transitions. Genuine rally evidence excludes initialization and binds source events to real score progression.',
  'The event overflow challenge is unperformed without an independently demonstrated native workload; no chip/queue state is fabricated.',
  'Canonical paddle endpoints retain original clipping and asymmetric resistance conversion; no endpoint position or remaining-lives meaning is invented.',
] };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameFields = (a, b) => a !== null && typeof a === 'object' && !Array.isArray(a)
  && equal(Object.keys(a).sort(), Object.keys(b).sort()) && Object.keys(b).every((key) => a[key] === b[key]);
const breakout = { id: 3, name: 'breakout', dip: 3, pot: 0, width: 324, height: 432 };
const oldGames = [
  { id: 0, name: 'pong', dip: 0, pot: 0, width: 576, height: 432 },
  { id: 1, name: 'pongdoubles', dip: 0, pot: 0, width: 576, height: 432 },
  { id: 2, name: 'spacerace', dip: 0, pot: 970000, width: 576, height: 432 },
];
let core;
const clock = (prefix = 'time') => (BigInt(core[`_nocpu_${prefix}_hi`]() >>> 0) << 32n) | BigInt(core[`_nocpu_${prefix}_lo`]() >>> 0);
function check(name, passed, details) {
  report.checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
  if (!passed) throw new Error(name);
}
function state() {
  return { game: core._nocpu_game() >>> 0, dip: core._nocpu_dip(), pot_ohms: core._nocpu_pot_ohms(),
    width: core._nocpu_width(), height: core._nocpu_height(), time_ps: clock().toString(),
    frames: core._nocpu_frame_number(), frame_time_ps: clock('frame_time').toString(),
    scores: [core._nocpu_score(0), core._nocpu_score(1)], active: core._nocpu_active(),
    run_n: core._nocpu_run_n() >>> 0, attract_n: core._nocpu_attract_n() >>> 0, hits: core._nocpu_hits(),
    raw_breakout: Array.from({ length: 6 }, (_, signal) => core._nocpu_breakout_signal(signal) >>> 0),
    contacts: [5, 6, 7].map((signal) => core._nocpu_breakout_count(signal) >>> 0),
    audio_count: core._nocpu_audio_count(), event_count: core._nocpu_event_count(),
    audio_overruns: core._nocpu_audio_overruns(), event_overruns: core._nocpu_event_overruns() };
}
function create(game) {
  check(`${game.name}/${game.dip}: configured creation`, core._nocpu_create_game(game.id, 848, game.dip, game.pot) === 1);
  check(`${game.name}/${game.dip}: actual native configuration and dimensions`,
    core._nocpu_game() === game.id && core._nocpu_dip() === game.dip && core._nocpu_pot_ohms() === game.pot
    && core._nocpu_width() === game.width && core._nocpu_height() === game.height && clock() === 0n);
}
const event = (ms, action, value, slot = 0) => ({ ms, action, value, slot });
function script(game) {
  // Bind the Space cadence challenge to the independently captured default
  // physical replay. Coin resets F7's scan counters; early Start only drives
  // the original timer circuit, and remains an explicit physical input.
  const events = game.id === 2 ? [event(200, 'start1', 1), event(300, 'start1', 0)] : [];
  events.push(event(500, 'coin', 1), event(600, 'coin', 0));
  if (game.id === 1) events.push(event(800, 'coin', 1), event(900, 'coin', 0));
  if (game.id !== 0) events.push(event(1000, 'start1', 1), event(1100, 'start1', 0));
  if (game.id === 3) events.push(event(1500, 'serve', 1), event(1600, 'serve', 0));
  return events;
}
function mediaCadence(game, commands, frames, durationMs, samples) {
  const duration = BigInt(durationMs) * 1000000000n;
  const period = game.id === 3 ? 15768335520n : 34920n * 4n * 455n * 262n;
  const first = game.id === 3 ? 14018475800n : game.id === 2 ? 16652279880n : 16652246960n;
  const reset = [499538611080n, 616652189640n];
  const sourceBoundSpace = game.id === 2 && game.dip === 0 && game.pot === 970000
    && equal(commands, [event(200, 'start1', 1), event(300, 'start1', 0),
      event(500, 'coin', 1), event(600, 'coin', 0), event(1000, 'start1', 1), event(1100, 'start1', 0)]);
  const expected = [];
  for (let time = first; time <= duration; time = sourceBoundSpace && time === reset[0] ? reset[1] : time + period) {
    expected.push(time.toString());
  }
  const exactFrames = frames.length === expected.length
    && frames.every((row, i) => row.frame === i && row.time_ps === expected[i]);
  const expectedSamples = durationMs * 48;
  return { passed: exactFrames && (game.id !== 2 || sourceBoundSpace)
      && Math.abs(samples - expectedSamples) <= 4 && clock() >= duration,
    source_clock_half_period_ps: '34920', frame_period_ps: period.toString(), first_frame_ps: first.toString(),
    frame_period_basis: game.id === 3 ? 'Measured original VBLANK:451556 halfcycles; not a complete analytic divider proof'
      : 'Original integer source-clock horizontal/vertical counts',
    expected_frames: expected.length, observed_frames: frames.length, exact_frame_indices_and_times: exactFrames,
    first_observed_ps: frames[0]?.time_ps ?? null, last_observed_ps: frames.at(-1)?.time_ps ?? null,
    source_bound_coin_reset_pair_ps: sourceBoundSpace ? reset.map(String) : [],
    source_bound_reset_replay_matches: game.id === 2 ? sourceBoundSpace : null,
    // This SHA binds the retained independent original default capture used
    // to establish the exceptional pair, rather than allowing arbitrary gaps.
    source_bound_reset_original_frames_sha256: sourceBoundSpace
      ? 'e29304b8cee91a04012571af53aea2fa492b975388c7cd03847a7ca480c1c08d' : null,
    expected_pcm_samples: expectedSamples, observed_pcm_samples: samples,
    pcm_initialization_sample_allowance: 4 };
}
function apply(item) {
  if (item.action === 'coin') core._nocpu_coin(item.value);
  else if (item.action === 'start1' || item.action === 'start2') {
    const result = core._nocpu_start_player(item.action === 'start1' ? 1 : 2, item.value);
    if (result !== 1) throw new Error('Supported explicit Start was rejected');
  } else if (item.action === 'serve') {
    if (core._nocpu_serve(item.value) !== 1) throw new Error('Supported Serve was rejected');
  } else if (item.action === 'paddle') core._nocpu_paddle(item.slot, item.value);
  else if (item.action === 'joystick') core._nocpu_joystick(item.slot, item.value, 1);
  else throw new Error(`Unknown action ${item.action}`);
}
function fnvRGB(rgba, width, height) {
  let lo = 0x84222325, hi = 0xcbf29ce4;
  // Original glReadPixels output is bottom-up RGB; the portable ABI is top-down.
  for (let y = height - 1; y >= 0; y -= 1) for (let x = 0; x < width; x += 1) for (let c = 0; c < 3; c += 1) {
    lo = (lo ^ rgba[(y * width + x) * 4 + c]) >>> 0;
    const product = lo * 435;
    hi = (hi * 435 + lo * 256 + Math.floor(product / 4294967296)) >>> 0;
    lo = product >>> 0;
  }
  return ((BigInt(hi) << 32n) | BigInt(lo)).toString();
}
function capture(label, game, commands = script(game), durationMs = 2200, originalHashes = false) {
  const hashes = Object.fromEntries(['rgba', 'frame_times', 'pcm', 'events', 'telemetry'].map((key) => [key, createHash('sha256')]));
  const events = [], frames = [], inputs = [];
  const ordered = commands.map((item, index) => ({ ...item, index })).sort((a, b) => a.ms - b.ms || a.index - b.index);
  let samples = 0, generatedFrame = 0, next = 0, nonzeroSamples = 0, lastEventTime = 0n;
  function drain() {
    const count = core._nocpu_audio_count(), pointer = core._nocpu_audio() >>> 0;
    if (count) {
      const pcm = core.HEAPU8.slice(pointer, pointer + count * 2);
      hashes.pcm.update(pcm); samples += count;
      const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      for (let i = 0; i < count; i += 1) if (view.getInt16(i * 2, true)) nonzeroSamples += 1;
    }
    core._nocpu_audio_clear();
    const offset = core._nocpu_events() >>> 2;
    for (let i = 0; i < core._nocpu_event_count(); i += 1) {
      const at = offset + i * 4, ps = (BigInt(core.HEAPU32[at + 1]) << 32n) | BigInt(core.HEAPU32[at]);
      const signal = core.HEAPU32[at + 2], value = core.HEAPU32[at + 3];
      if (signal > 10 || value > 1 || ps > clock() || ps < lastEventTime
        || (game.id === 3 && signal < 5) || (game.id !== 3 && signal > 4)) throw new Error('Malformed/cross-game native event');
      lastEventTime = ps;
      events.push({ time_ps: ps.toString(), signal, value }); hashes.events.update(`${ps},${signal},${value}\n`);
    }
    core._nocpu_events_clear();
    if (game.id === 3 && core._nocpu_collision_count()) throw new Error('Breakout generated synthetic Pong HIT');
    core._nocpu_collisions_clear();
    if (core._nocpu_audio_overruns() || core._nocpu_event_overruns()) throw new Error('Drained native queue overflowed');
  }
  drain();
  for (let ms = 0; ms <= durationMs; ms += 1) {
    const before = state(); hashes.telemetry.update(`${JSON.stringify(before)}\n`);
    while (next < ordered.length && ordered[next].ms <= ms) {
      const item = ordered[next++]; inputs.push({ ...item, applied_ps: clock().toString() }); apply(item);
    }
    if (ms === durationMs) break;
    if (core._nocpu_advance(1000) !== 1) throw new Error('Integer native step rejected');
    drain();
    const frame = core._nocpu_frame_number();
    if (frame !== generatedFrame) {
      if (frame !== generatedFrame + 1) throw new Error('One-ms observer lost a native frame');
      const rgba = core.HEAPU8.slice(core._nocpu_frame(), core._nocpu_frame() + game.width * game.height * 4);
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) throw new Error('Nonopaque native frame');
      hashes.rgba.update(rgba); hashes.frame_times.update(`${frame},${clock('frame_time')}\n`);
      frames.push({ frame: frame - 1, time_ps: clock('frame_time').toString(), ...(originalHashes ? { fnv1a64: fnvRGB(rgba, game.width, game.height) } : {}) });
      generatedFrame = frame;
    }
  }
  const final = state();
  const media = mediaCadence(game, commands, frames, durationMs, samples);
  const fingerprint = { streams: Object.fromEntries(Object.entries(hashes).map(([key, value]) => [key, value.digest('hex')])),
    samples, nonzero_samples: nonzeroSamples, frames: generatedFrame, events: events.length, final };
  report.traces.push({ label, game: { ...game }, requested_inputs: inputs, native_events: events,
    ...(originalHashes ? { whole_RGB_frames: frames } : {}), media_coverage: media, fingerprint });
  check(`${label}: exact source-bound frame cadence/PCM duration/native time`, media.passed, media);
  check(`${label}: normal drain/overrun visibility`, !final.audio_count && !final.event_count && !final.audio_overruns && !final.event_overruns);
  if (game.id === 3) {
    const expectedCounts = [5, 6, 7].map((signal) => events.filter((row) => row.signal === signal && row.value === (signal === 5 ? 1 : 0)).length);
    check(`${label}: only named contact polarities counted`, equal(final.contacts, expectedCounts));
    check(`${label}: truthful raw credit/active and non-Pong HIT`, final.run_n === final.raw_breakout[2]
      && final.attract_n === final.raw_breakout[1] && final.active === final.attract_n && !final.hits);
  }
  return fingerprint;
}
function fresh(label, game, commands, durationMs = 2200) {
  create(game); const result = capture(label, game, commands, durationMs); core._nocpu_destroy(); return result;
}
async function oracle(epoch, name, expectedScript, durationMs) {
  if (!epoch) throw new Error(`--${name === 'pilot' ? 'original-epoch' : 'rally-epoch'} is required`);
  const folder = resolve(epoch), paths = ['events.csv', 'frames.csv', 'audio.s16le', 'telemetry.csv', 'inputs.csv'];
  const bytes = Object.fromEntries(await Promise.all(paths.map(async (file) => [file, await readFile(resolve(folder, file))])));
  const receiptBytes = await readFile(resolve(folder, '../../../capture-report.json'));
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const actualAttempt = receipt.attempts?.find((attempt) => attempt.scenario === basename(dirname(dirname(folder)))
    && attempt.attempt === basename(dirname(folder)));
  check(`${name}: actual original receipt/source and immutable stream identities`, receipt.capture_complete === true
    && receipt.all_fresh_repeat_streams_exact === true && actualAttempt?.captured === true
    && receipt.source_pins?.['games/breakout.cpp'] === '91e6e2bdea6705569f481352ad605035367dc5ae1d6350878e6a35013fe1a1a9'
    && paths.every((file) => actualAttempt.files?.[`epoch0/${file}`]?.sha256 === sha(bytes[file])
      && actualAttempt.files?.[`epoch0/${file}`]?.bytes === bytes[file].length));
  const configBytes = await readFile(resolve(folder, '../configuration.json'));
  const config = JSON.parse(configBytes.toString('utf8'));
  const switchReadback = { bonus_credit: 3, cabinet_type: 0, coinage: 0, ball_count: 0 };
  const historicalConfig = sameFields(config, { game: 'breakout', ...switchReadback });
  const canonicalConfig = sameFields(config, { game: 'breakout', dip: 3, pot_ohms: 0 });
  const configIdentity = { bytes: configBytes.length, sha256: sha(configBytes) };
  check(`${name}: receipt binds actual original configuration bytes`, sameFields(actualAttempt.files?.['configuration.json'], configIdentity));
  let switchesIdentity = null;
  if (canonicalConfig) {
    const switchesBytes = await readFile(resolve(folder, '../breakout-switches.json'));
    const switches = JSON.parse(switchesBytes.toString('utf8'));
    switchesIdentity = { bytes: switchesBytes.length, sha256: sha(switchesBytes) };
    check(`${name}: receipt binds canonical actual named original switch readbacks`, sameFields(switches, switchReadback)
      && sameFields(actualAttempt.files?.['breakout-switches.json'], switchesIdentity));
  }
  check(`${name}: strict labelled default original configuration`, historicalConfig || canonicalConfig);
  const rows = (file) => bytes[file].toString('utf8').trim().split(/\r?\n/).slice(1).map((line) => line.split(','));
  const commands = rows('inputs.csv').filter((row) => row[2] !== 'recreate').map(([requested, , action, value]) =>
    event(Number(BigInt(requested) / 1000000000n), action === 'start' ? 'start1' : action === 'paddle1' ? 'paddle' : action, Number(value)));
  check(`${name}: independently declared physical replay`, equal(commands, expectedScript));
  const mappedEvents = rows('events.csv').map(([time_ps, signal, value]) => ({ time_ps, signal: Number(signal) - 95, value: Number(value) }));
  check(`${name}: original source event schema`, mappedEvents.length > 0
    && mappedEvents.every((row) => row.signal >= 5 && row.signal <= 10 && [0, 1].includes(row.value)));
  const originalFrames = rows('frames.csv').map(([frame, time_ps, fnv1a64]) => ({ frame: Number(frame), time_ps, fnv1a64 }));
  check(`${name}: original complete exact cadence`, originalFrames.length === Number((BigInt(durationMs) * 1000000000n - 14018475800n) / 15768335520n) + 1
    && originalFrames.every((row, i) => row.frame === i && BigInt(row.time_ps) === 14018475800n + BigInt(i) * 15768335520n));
  const record = { name, folder, duration_ms: durationMs, original_source_sha256: '91e6e2bdea6705569f481352ad605035367dc5ae1d6350878e6a35013fe1a1a9',
    capture_report_sha256: sha(receiptBytes), original_executable_sha256: receipt.executable_sha256,
    original_source_pins: receipt.source_pins,
    configuration: config, configuration_shape: historicalConfig ? 'exploratory_named_original' : 'canonical_packed_with_named_original_readback',
    configuration_identity: configIdentity, named_switch_readback_identity: switchesIdentity,
    files: Object.fromEntries(paths.map((file) => [file, { size: bytes[file].length, sha256: sha(bytes[file]) }])) };
  report.original_oracles ??= []; report.original_oracles.push(record);
  if (name === 'rally') {
    const paddle = mappedEvents.filter((row) => row.signal === 6 && !row.value && BigInt(row.time_ps) > 3300000000000n);
    const brick = mappedEvents.filter((row) => row.signal === 5 && row.value && BigInt(row.time_ps) > 3300000000000n);
    const genuineScores = rows('telemetry.csv').filter(([time_ps, score1, , , , , active]) =>
      BigInt(time_ps) > 3300000000000n && Number(score1) > 0 && Number(active) === 1);
    check('Original warm-RAM rally has genuine paddle then brick/active score observations', paddle.length > 0
      && brick.some((row) => BigInt(row.time_ps) > BigInt(paddle[0].time_ps)) && genuineScores.length > 0);
    record.genuine_contacts = { paddle_edges: paddle, brick_edges: brick, nonstartup_score_rows: genuineScores.length };
  }
  create(breakout); const fingerprint = capture(`${name}: original-calibrated full media/events`, breakout, commands, durationMs, true);
  const trace = report.traces.at(-1);
  check(`${name}: exact named original lifecycle/contact timestamps`, equal(trace.native_events, mappedEvents));
  check(`${name}: exact original whole RGB raster/frame timing`, equal(trace.whole_RGB_frames, originalFrames));
  check(`${name}: exact original PCM bytes`, fingerprint.streams.pcm === record.files['audio.s16le'].sha256);
  return fingerprint; // live genuinely warm machine retained for reset challenge
}
try {
  report.tool_sha256 = sha(await readFile(new URL(import.meta.url)));
  report.module_sha256 = sha(await readFile(resolve(options.module)));
  report.wasm_sha256 = sha(await readFile(resolve(dirname(options.module), 'nocpu.wasm')));
  report.original_inventory_sha256 = sha(await readFile(new URL('../tests/source-manifest.json', import.meta.url)));
  const inventory = JSON.parse(await readFile(new URL('../tests/source-manifest.json', import.meta.url), 'utf8'));
  check('Immutable original Breakout source identity', inventory.files.find((file) => file.path === 'games/breakout.cpp')?.sha256
    === '91e6e2bdea6705569f481352ad605035367dc5ae1d6350878e6a35013fe1a1a9');
  const factory = (await import(pathToFileURL(resolve(options.module)).href)).default;
  core = await factory({ print: () => {}, printErr: (line) => process.stderr.write(`${line}\n`) });
  check('ABI5 and48000Hz native PCM', core._nocpu_abi_version() === 5 && core._nocpu_sample_rate() === 48000);
  const cold = state();
  for (const [game, dip, pot] of [[4, 3, 0], [3, 9, 0], [3, 128, 0], [3, 0x80000003, 0], [3, 3, 1]]) {
    check(`invalid uncreated config ${game}/${dip}/${pot}`, core._nocpu_create_game(game, 848, dip, pot) === 0 && equal(cold, state()));
  }
  check('Uncreated new switches unsupported', !core._nocpu_start_player(1, 1) && !core._nocpu_start_player(2, 1) && !core._nocpu_serve(1));
  const baseline = fresh('Breakout fresh default', breakout);
  create(breakout); const before = state();
  check('Undefined raw signals and lifecycle IDs are not contact counts',
    (core._nocpu_breakout_signal(6) >>> 0) === 4294967295
    && [4, 8, 9, 10, 99].every((signal) => (core._nocpu_breakout_count(signal) >>> 0) === 4294967295));
  for (const [dip, pot] of [[9, 0], [128, 0], [0xffffffff, 0], [3, 1]]) {
    check(`invalid live reset ${dip}/${pot}: no mutation`, !core._nocpu_reset_config(1, dip, pot) && equal(before, state()));
  }
  check('Duplicate and bounded advances preserve live machine', !core._nocpu_create_game(3, 1, 3, 0)
    && !core._nocpu_advance(100001) && core._nocpu_advance(0) === 1 && equal(before, state()));
  check('Invalid Start players do not change machine', !core._nocpu_start_player(0, 1) && !core._nocpu_start_player(3, 1) && equal(before, state()));
  core._nocpu_paddle(1, -32768); core._nocpu_paddle(99, 32767); core._nocpu_joystick(0, 1, 1); core._nocpu_joystick(1, 1, 1);
  const untouched = capture('Breakout invalid settings/channels subsequent output', breakout); core._nocpu_destroy();
  check('Invalid requests preserve actual future media/events/clock', equal(untouched, baseline));
  const axisHashes = [];
  for (const axis of [-32768, -20000, 0, 20000, 32767]) {
    const result = fresh(`Shared horizontal axis ${axis}`, breakout, [...script(breakout), event(1800, 'paddle', axis)]);
    axisHashes.push(result.streams.rgba);
    if (axis) check(`Axis ${axis} changes actual original court`, result.streams.rgba !== baseline.streams.rgba);
    else check('Canonical zero is original neutral position', equal(result, baseline));
  }
  check('One shared axis produces independent signed positions', new Set(axisHashes).size === 5);
  for (const [requested, legal] of [[-999999, -32768], [999999, 32767]]) {
    const a = fresh(`Legal endpoint ${legal}`, breakout, [...script(breakout), event(1800, 'paddle', legal)]);
    const b = fresh(`Clamped endpoint ${requested}`, breakout, [...script(breakout), event(1800, 'paddle', requested)]);
    check(`Axis ${requested} clamps without resistor endpoint repair`, equal(a, b));
  }
  const twoPlayer = [event(500, 'coin', 1), event(600, 'coin', 0), event(800, 'coin', 1), event(900, 'coin', 0),
    event(1200, 'start2', 1), event(1300, 'start2', 0), event(1700, 'serve', 1), event(1800, 'serve', 0)];
  const start2 = fresh('Distinct original Start2', breakout, twoPlayer, 8000);
  check('Start2 two-credit original player transition', start2.final.active === 1 && start2.final.raw_breakout[4] === 1
    && report.traces.at(-1).native_events.some((row) => row.signal === 9 && row.value === 1 && BigInt(row.time_ps) > 4000000000000n));
  const noServe = fresh('Explicit no-Serve request', breakout, script(breakout).filter((item) => item.action !== 'serve'), 5000);
  const heldServe = fresh('Held original Serve request', breakout, script(breakout).filter((item) => item.action !== 'serve' || item.value === 1), 5000);
  check('Held Serve is a distinct physical input', !equal(noServe, heldServe));
  for (const dip of [...Array.from({ length: 9 }, (_, i) => i), 3 | 16, 3 | 32, 3 | 64, 8 | 16 | 32 | 64]) {
    const chosen = { ...breakout, dip }, expected = fresh(`DIP${dip}: independent fresh machine`, chosen);
    create(breakout);
    check(`DIP${dip}: fresh configured reset accepts indices`, core._nocpu_reset_config(848, dip, 0) === 1);
    const applied = capture(`DIP${dip}: configured-reset media`, chosen);
    check(`DIP${dip}: applied configuration produces fresh-equivalent output`, equal(applied, expected));
    core._nocpu_coin(1); core._nocpu_start_player(1, 1); core._nocpu_start_player(2, 1); core._nocpu_serve(1); core._nocpu_paddle(0, 32767);
    check(`DIP${dip}: held switch warmup`, core._nocpu_advance(100000) === 1);
    check(`DIP${dip}: reset releases all input and retains settings`, core._nocpu_reset(848) === 1 && core._nocpu_dip() === dip);
    const reset = capture(`DIP${dip}: retained-settings held-input reset`, chosen); core._nocpu_destroy();
    check(`DIP${dip}: reset actual media/events/time exactly fresh`, equal(reset, expected));
  }
  const baselines = new Map([[3, baseline]]);
  for (const game of oldGames) {
    baselines.set(game.id, fresh(`${game.name}: isolated gain baseline`, game));
    create(game);
    check(`${game.name}: new unsupported controls rejected`, !core._nocpu_start_player(2, 1) && !core._nocpu_serve(1));
    check(`${game.name}: unavailable raw Breakout fields`, Array.from({ length: 6 }, (_, i) => core._nocpu_breakout_signal(i) >>> 0).every((value) => value === 4294967295)
      && [5, 6, 7].every((i) => (core._nocpu_breakout_count(i) >>> 0) === 4294967295));
    const unchanged = capture(`${game.name}: unsupported controls future media`, game); core._nocpu_destroy();
    check(`${game.name}: new controls have no output side effect`, equal(unchanged, baselines.get(game.id)));
  }
  for (const id of [3, 2, 1, 0, 3, 0, 2, 3]) {
    const game = id === 3 ? breakout : oldGames[id], actual = fresh(`${game.name}: mixed gain/RAM/projection sequence`, game);
    check(`${game.name}: repeated80/50/10 gain and frame/descriptor isolation`, equal(actual, baselines.get(id)));
  }
  const pilotScript = [...script(breakout), event(2200, 'paddle', -20000), event(3000, 'paddle', 20000), event(3800, 'paddle', 0), event(4500, 'serve', 1), event(4600, 'serve', 0)];
  await oracle(options['original-epoch'], 'pilot', pilotScript, 8000); core._nocpu_destroy();
  const rallyScript = [...script(breakout), event(2200, 'paddle', 14000)];
  await oracle(options['rally-epoch'], 'rally', rallyScript, 30000);
  core._nocpu_coin(1); core._nocpu_start_player(1, 1); core._nocpu_start_player(2, 1); core._nocpu_serve(1); core._nocpu_paddle(0, -32768);
  check('Genuinely played brick-RAM/analog machine reset', core._nocpu_reset(848) === 1);
  const afterRally = capture('Genuine rally warm-RAM/input reset', breakout); core._nocpu_destroy();
  check('Genuine gameplay RAM/mixer/input reset equals original cold machine media', equal(afterRally, baseline));
  core._nocpu_destroy();
  check('Repeatable destroy drops all media and native clock', !core._nocpu_frame() && !core._nocpu_audio_count() && !core._nocpu_event_count() && clock() === 0n);
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = error instanceof Error ? error.message : String(error); process.exitCode = 1;
} finally {
  core?._nocpu_destroy();
  report.completed_checks = report.checks.length; report.passed_checks = report.checks.filter((item) => item.passed).length;
  report.event_overflow_challenge = { performed: false, limitation: 'No proven original workload exceeds4096; normal drained streams and persistent overrun getters checked without fabricated state.' };
  await mkdir(dirname(resolve(options.output)), { recursive: true });
  await writeFile(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Breakout ABI probe: ${report.passed ? 'PASS' : 'FAIL'}; ${report.passed_checks}/${report.completed_checks} checks; ${resolve(options.output)}\n`);
}
