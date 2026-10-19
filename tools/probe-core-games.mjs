#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Challenge the real Wasm ABI using circuit media and exact time/event output.
// No mock module, descriptor edits, fake memory or browser viewport inference.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// --rom-dir: staged descriptors <dir>/<game>/<member> (tools/compare-rom-games.py
// stages them privately). Without it a ROM-backed registered game is only
// checked to refuse creation without its ROMs; that is not a contract pass.
const options = { module: 'build/core/wasm/nocpu.js', output: 'build/core/game-abi-probe.json', 'rom-dir': '' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option ${process.argv[i]}`);
  options[key] = process.argv[i + 1];
}
// Numeric IDs retain the ABI2 access contract within ABI4; circuit descriptions,
// physical channels and setting values are audited from original DICE 0.9.
const games = [
  { id: 0, name: 'pong', dip: 0, pot: 0, paddles: 2 },
  { id: 1, name: 'pongdoubles', dip: 0, pot: 0, paddles: 4 },
  { id: 2, name: 'spacerace', dip: 0, pot: 970000, paddles: 0 },
];
const report = { schema_version: 1, seed: 848, checks: [], traces: [],
  limitations: [
    'This is Wasm ABI/lifecycle evidence. Original-native and browser comparisons are separate gates.',
    'Distinct channel fingerprints establish channel reachability; original-frame geometry establishes physical mapping.',
    'Settings retention/readback and fresh-machine output equivalence do not replace original DIP/timer outcome scenarios.',
    'An overflowing event queue requires a demonstrated original circuit workload; no event or descriptor state is fabricated here.',
    'No actual phone, controller or speaker output is measured by Node.',
  ] };
let core;
const sha = (data) => createHash('sha256').update(data).digest('hex');
const time = (prefix = 'time') => (BigInt(core[`_nocpu_${prefix}_hi`]() >>> 0) << 32n) | BigInt(core[`_nocpu_${prefix}_lo`]() >>> 0);
function check(name, passed, details) {
  report.checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
  if (!passed) throw new Error(name);
}
function state() {
  return { game: core._nocpu_game() >>> 0, dip: core._nocpu_dip(), pot_ohms: core._nocpu_pot_ohms(),
    time_ps: time().toString(), frames: core._nocpu_frame_number(), frame_time_ps: time('frame_time').toString(),
    scores: [core._nocpu_score(0), core._nocpu_score(1)], hits: core._nocpu_hits(),
    crashes: [core._nocpu_crashes(0), core._nocpu_crashes(1)], run_n: core._nocpu_run_n() >>> 0,
    attract_n: core._nocpu_attract_n() >>> 0, active: core._nocpu_active(),
    audio_overruns: core._nocpu_audio_overruns(), event_overruns: core._nocpu_event_overruns(),
    audio_count: core._nocpu_audio_count(), event_count: core._nocpu_event_count() };
}
function create(game) {
  if (game.roms) stageRoms(game);
  check(`${game.name}: configured create succeeds`, core._nocpu_create_game(game.id, 848, game.dip, game.pot) === 1);
  check(`${game.name}: native settings accepted`, core._nocpu_game() === game.id && core._nocpu_dip() === game.dip && core._nocpu_pot_ohms() === game.pot);
  check(`${game.name}: cold integer clock`, time() === 0n && core._nocpu_frame_number() === 0);
}
const action = (ms, kind, slot, value, other) => ({ ms, kind, slot, value, ...(other === undefined ? {} : { other }) });
// TV Basketball's coin holds a 0.52 s one-shot (3B) and stops the video sync
// while it runs, so its two coins (a four-player game) are spaced by that
// one-shot and its traces run longer to hold as many frames.
const SYNC_STOPPING_COIN = new Set(['tvbasketball']);
// DICE wires no circuit output to the AUDIO chip of these games (inherited
// absent audio): their PCM is the audio chip's single constructor sample.
// Pin Pong's sound is NoCPU's reconstruction from the schematic: a full stream.
const NO_AUDIO_HOOKUP = new Set(['hiway', 'antiaircraft', 'sharkjaws', 'jetfighter']);
// Staged descriptor bytes of ROM-backed registered games, by game name.
const romPayloads = new Map();
function stageRoms(game) {
  const payloads = romPayloads.get(game.name);
  check(`${game.name}: ROM session begins`, core._nocpu_rom_begin(game.id) === 1);
  payloads.forEach((bytes, slot) => {
    const pointer = core._nocpu_rom_buffer(slot, bytes.length);
    check(`${game.name}: ROM slot ${slot} buffer`, pointer !== 0);
    core.HEAPU8.set(bytes, pointer);
  });
  check(`${game.name}: staged ROMs verified`, core._nocpu_rom_finish() === 1);
}
const probeMs = (game) => SYNC_STOPPING_COIN.has(game.name) ? 3300 : 2200;
function playScript(game) {
  if (SYNC_STOPPING_COIN.has(game.name)) return [action(100, 'coin', 0, 1), action(200, 'coin', 0, 0),
    action(650, 'coin', 0, 1), action(750, 'coin', 0, 0), action(1200, 'start', 0, 1), action(1300, 'start', 0, 0)];
  const script = [action(500, 'coin', 0, 1), action(600, 'coin', 0, 0)];
  // A second coin: Pong Doubles, and four-paddle registered games, whose one-credit
  // game may leave two paddles out of play (Quadrapong's top and bottom walls).
  if (game.id === 1 || (game.registered && game.paddles === 4)) script.push(action(800, 'coin', 0, 1), action(900, 'coin', 0, 0));
  if (game.registered ? game.starts > 0 : game.id !== 0) script.push(action(1100, 'start', 0, 1), action(1200, 'start', 0, 0));
  return script;
}
function apply(event) {
  if (event.kind === 'coin') core._nocpu_coin(event.value);
  else if (event.kind === 'start') core._nocpu_start(event.value);
  else if (event.kind === 'paddle') core._nocpu_paddle(event.slot, event.value);
  else if (event.kind === 'joystick') core._nocpu_joystick(event.slot, event.value, event.other);
  else if (event.kind === 'switches') core._nocpu_joystick_switches(event.slot, ...event.value);
  else if (event.kind === 'button') core._nocpu_button(event.slot, event.other, event.value);
  else if (event.kind === 'wheel') core._nocpu_wheel(event.slot, event.value);
  else throw new Error(`Unsupported probe action ${event.kind}`);
}
function capture(label, game, script = playScript(game), durationMs = probeMs(game)) {
  const streams = Object.fromEntries(['rgba', 'frame_times', 'pcm', 'events', 'collisions'].map((key) => [key, createHash('sha256')]));
  const events = [], requested = [];
  let samples = 0, frame = 0, eventIndex = 0, eventCount = 0, collisions = 0;
  const sorted = script.map((item, index) => ({ ...item, index })).sort((a, b) => a.ms - b.ms || a.index - b.index);
  function drain() {
    const count = core._nocpu_audio_count();
    if (count) { streams.pcm.update(core.HEAPU8.slice(core._nocpu_audio(), core._nocpu_audio() + count * 2)); samples += count; }
    core._nocpu_audio_clear();
    const offset = core._nocpu_events() >>> 2;
    for (let i = 0; i < core._nocpu_event_count(); i += 1) {
      const at = offset + i * 4, ps = (BigInt(core.HEAPU32[at + 1]) << 32n) | BigInt(core.HEAPU32[at]);
      const signal = core.HEAPU32[at + 2], value = core.HEAPU32[at + 3];
      const row = { time_ps: ps.toString(), signal, value };
      events.push(row); streams.events.update(`${ps},${signal},${value}\n`); eventCount += 1;
      const registeredEvent = game.registered && signal >= 200 && signal < 208;
      if ((signal > 4 && !registeredEvent) || value > 1 || ps > time()) throw new Error(`${label}: malformed native event`);
    }
    core._nocpu_events_clear();
    const hitOffset = core._nocpu_collisions() >>> 2;
    for (let i = 0; i < core._nocpu_collision_count(); i += 1) {
      const at = hitOffset + i * 3, ps = (BigInt(core.HEAPU32[at + 1]) << 32n) | BigInt(core.HEAPU32[at]);
      streams.collisions.update(`${ps},${core.HEAPU32[at + 2]}\n`); collisions += 1;
    }
    core._nocpu_collisions_clear();
  }
  drain();
  for (let ms = 0; ms <= durationMs; ms += 10) {
    while (eventIndex < sorted.length && sorted[eventIndex].ms <= ms) {
      const event = sorted[eventIndex++];
      requested.push({ ...event, applied_time_ps: time().toString() }); apply(event);
    }
    if (ms === durationMs) break;
    if (core._nocpu_advance(10000) !== 1) throw new Error(`${label}: valid bounded step rejected`);
    drain();
    const nextFrame = core._nocpu_frame_number();
    if (nextFrame !== frame) {
      if (nextFrame !== frame + 1) throw new Error(`${label}: 10 ms observation lost a generated frame`);
      const rgba = core.HEAPU8.slice(core._nocpu_frame(), core._nocpu_frame() + core._nocpu_width() * core._nocpu_height() * 4);
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) throw new Error(`${label}: nonopaque generated frame`);
      streams.rgba.update(rgba); streams.frame_times.update(`${nextFrame},${time('frame_time')}\n`); frame = nextFrame;
    }
  }
  const final = state();
  const fingerprint = { streams: Object.fromEntries(Object.entries(streams).map(([key, hash]) => [key, hash.digest('hex')])),
    samples, frame_count: frame, event_count: eventCount, collision_count: collisions, final };
  report.traces.push({ label, game: { ...game }, requested, events, fingerprint });
  check(`${label}: native media and exact time present`, frame >= 120 && (NO_AUDIO_HOOKUP.has(game.name) ? samples === 1 : samples >= 100000) && time() >= BigInt(durationMs) * 1000000000n);
  check(`${label}: drained native queues do not overflow`, final.audio_overruns === 0 && final.event_overruns === 0 && final.audio_count === 0 && final.event_count === 0);
  return fingerprint;
}
function fresh(label, game, script) { create(game); const result = capture(label, game, script); core._nocpu_destroy(); return result; }
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  report.tool_sha256 = sha(await readFile(new URL(import.meta.url)));
  report.module_sha256 = sha(await readFile(resolve(options.module)));
  report.wasm_sha256 = sha(await readFile(resolve(dirname(options.module), 'nocpu.wasm')));
  report.original_inventory_sha256 = sha(await readFile(new URL('../tests/source-manifest.json', import.meta.url)));
  const factory = (await import(pathToFileURL(resolve(options.module)).href)).default;
  core = await factory({ print: () => {}, printErr: (message) => { process.stderr.write(`${message}\n`); } });
  check('ABI5 required', core._nocpu_abi_version() === 5);
  check('media dimensions/sample rate preserve original contract', core._nocpu_width() === 576 && core._nocpu_height() === 432 && core._nocpu_sample_rate() === 48000);
  const uncreated = state();
  for (const args of [[4, 0, 0], [0, 2, 0], [1, 0, 1], [2, 0, 469999], [2, 0, 1470001]]) {
    check(`invalid create ${args}: rejected without mutation`, core._nocpu_create_game(args[0], 848, args[1], args[2]) === 0 && equal(uncreated, state()));
  }
  check('uncreated machine cannot advance/reset/expose media', core._nocpu_advance(1) === 0 && core._nocpu_reset(848) === 0 && core._nocpu_frame() === 0);
  const baselines = new Map();
  for (const game of games) {
    baselines.set(game.id, fresh(`${game.name}: fresh baseline`, game));
    create(game); const before = state();
    check(`${game.name}: duplicate/oversize/zero requests preserve cold machine`,
      core._nocpu_create_game(game.id, 1, game.dip, game.pot) === 0 && core._nocpu_advance(100001) === 0
      && core._nocpu_advance(0) === 1 && equal(before, state()));
    check(`${game.name}: invalid reset options preserve live machine`, core._nocpu_reset_config(9, 2, game.pot) === 0 && equal(before, state()));
    check(`${game.name}: invalid potentiometer preserves live machine`,
      core._nocpu_reset_config(9, game.dip, game.id === 2 ? 1470001 : 1) === 0 && equal(before, state()));
    const invalid = [...playScript(game), action(1400, 'paddle', game.paddles, -32768), action(1400, 'paddle', 99, 32767),
      action(1400, 'joystick', 2, 1, 1), action(1400, 'joystick', 99, 1, 1)];
    if (game.id !== 2) invalid.push(action(1400, 'joystick', 0, 1, 1), action(1400, 'joystick', 1, 1, 1));
    else invalid.push(action(1400, 'paddle', 0, -32768), action(1400, 'paddle', 1, 32767));
    if (game.id === 0) invalid.push(action(1400, 'start', 0, 1));
    const unchanged = capture(`${game.name}: unsupported channels`, game, invalid); core._nocpu_destroy();
    check(`${game.name}: unsupported channels have no media/event/state effect`, equal(unchanged, baselines.get(game.id)));
    create(game);
    core._nocpu_coin(1); core._nocpu_start(1);
    for (let slot = 0; slot < 4; slot += 1) core._nocpu_paddle(slot, slot % 2 ? 32767 : -32768);
    for (let slot = 0; slot < 2; slot += 1) core._nocpu_joystick(slot, 1, 1);
    check(`${game.name}: held-input warmup`, core._nocpu_advance(100000) === 1);
    check(`${game.name}: held-input reset accepts original selected settings`, core._nocpu_reset(848) === 1);
    const reset = capture(`${game.name}: held-input reset`, game); core._nocpu_destroy();
    check(`${game.name}: reset media/events/time exactly match fresh machine`, equal(reset, baselines.get(game.id)));
  }
  for (const game of [games[0], games[1]]) {
    const unclamped = [...playScript(game), ...Array.from({ length: game.paddles }, (_, slot) => action(1400, 'paddle', slot, slot % 2 ? 999999 : -999999))];
    const legal = unclamped.map((event) => event.kind === 'paddle' ? { ...event, value: Math.max(-32768, Math.min(32767, event.value)) } : event);
    const a = fresh(`${game.name}: legal extremes`, game, legal), b = fresh(`${game.name}: clamped extremes`, game, unclamped);
    check(`${game.name}: signed-axis clamp preserves circuit output`, equal(a, b));
  }
  const distinctPaddles = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const measured = fresh(`pongdoubles: independent paddle ${slot + 1}`, games[1], [...playScript(games[1]), action(1400, 'paddle', slot, -20000)]);
    distinctPaddles.push(measured.streams.rgba);
    check(`pongdoubles: paddle ${slot + 1} changes generated court`, measured.streams.rgba !== baselines.get(1).streams.rgba);
  }
  check('pongdoubles: each independent channel has a distinct court result', new Set(distinctPaddles).size === 4);
  for (let slot = 0; slot < 2; slot += 1) {
    const up = fresh(`spacerace: rocket ${slot + 1} Up`, games[2], [...playScript(games[2]), action(1400, 'joystick', slot, 1, 0)]);
    check(`spacerace: rocket ${slot + 1} digital Up affects court`, up.streams.rgba !== baselines.get(2).streams.rgba);
    const neutralAfterUp = fresh(`spacerace: rocket ${slot + 1} release after Up`, games[2],
      [...playScript(games[2]), action(1400, 'joystick', slot, 1, 0), action(1800, 'joystick', slot, 0, 0)]);
    const downAfterUp = fresh(`spacerace: rocket ${slot + 1} Down after Up`, games[2],
      [...playScript(games[2]), action(1400, 'joystick', slot, 1, 0), action(1800, 'joystick', slot, 0, 1)]);
    check(`spacerace: rocket ${slot + 1} digital Down changes moved court`, downAfterUp.streams.rgba !== neutralAfterUp.streams.rgba);
    check(`spacerace: rocket ${slot + 1} releasing Up changes ongoing movement`, neutralAfterUp.streams.rgba !== up.streams.rgba);
    const centered = fresh(`spacerace: rocket ${slot + 1} explicit neutral`, games[2], [...playScript(games[2]), action(1400, 'joystick', slot, 0, 0)]);
    check(`spacerace: digital center releases switches without moving rocket`, equal(centered, baselines.get(2)));
  }
  for (const game of [
    { ...games[0], dip: 1 }, { ...games[1], dip: 1 },
    { ...games[2], dip: 1, pot: 470000 }, { ...games[2], dip: 1, pot: 1470000 },
  ]) {
    const expected = fresh(`${game.name}: alternate settings ${game.dip}/${game.pot}`, game);
    create(game); core._nocpu_coin(1); core._nocpu_start(1); core._nocpu_advance(100000);
    check(`${game.name}: alternate settings survive reset`, core._nocpu_reset(848) === 1 && core._nocpu_dip() === game.dip && core._nocpu_pot_ohms() === game.pot);
    const actual = capture(`${game.name}: alternate configured reset ${game.dip}/${game.pot}`, game); core._nocpu_destroy();
    check(`${game.name}: alternate reset output matches alternate fresh output`, equal(expected, actual));
    create(games[game.id]);
    check(`${game.name}: reset_config applies alternate settings`, core._nocpu_reset_config(848, game.dip, game.pot) === 1);
    const applied = capture(`${game.name}: explicit alternate reset ${game.dip}/${game.pot}`, game); core._nocpu_destroy();
    check(`${game.name}: explicit alternate reset media matches fresh settings`, equal(expected, applied));
  }
  for (const id of [0, 1, 2, 0, 2, 1, 0]) {
    const game = games[id], actual = fresh(`${game.name}: mixed-machine sequence`, game);
    check(`${game.name}: game-switch and audio-gain isolation`, equal(actual, baselines.get(id)));
  }
  // Independent original DICE capture, seed848, fresh process, default settings:
  // build/reference-games/20261011T054438379290328Z/spacerace-default/...
  // The immutable-source exploration proved these crash edges. Do not assume
  // that a short neutral baseline produces any events or count initialization.
  const crashScript = [action(200, 'start', 0, 1), action(300, 'start', 0, 0),
    action(500, 'coin', 0, 1), action(600, 'coin', 0, 0),
    action(1000, 'start', 0, 1), action(1100, 'start', 0, 0),
    action(2000, 'joystick', 0, 1, 0), action(2800, 'joystick', 0, 0, 0),
    action(3200, 'joystick', 0, 0, 1), action(3800, 'joystick', 0, 0, 0),
    action(4200, 'joystick', 1, 1, 0), action(5000, 'joystick', 1, 0, 0),
    action(5400, 'joystick', 1, 0, 1), action(6000, 'joystick', 1, 0, 0),
    action(6500, 'joystick', 0, 1, 0), action(6500, 'joystick', 1, 1, 0)];
  create(games[2]); capture('spacerace: original-calibrated crash transitions', games[2], crashScript, 7000); core._nocpu_destroy();
  const spaceEvents = report.traces.at(-1).events;
  const originalCrashEvents = [
    { time_ps: '3110235619760', signal: 1, value: 0 },
    { time_ps: '4627167962480', signal: 2, value: 0 },
    { time_ps: '4814183333484', signal: 1, value: 1 },
    { time_ps: '6331115676204', signal: 2, value: 1 },
  ];
  report.original_crash_oracle = { seed: 848, settings: { dip: 0, pot_ohms: 970000 },
    source_inventory_sha256: report.original_inventory_sha256, events: originalCrashEvents,
    measured_scenario_sha256: '71b984555ef13cc4702c22c244b4140d65c639d3bd08dcbab0551aee7a369eb5',
    measured_events_csv_sha256: '83e82a8a9a691a3aa46616440e8feb2c5a7e3f2930fb02ba05008b82616119ab',
    limitation: 'Exploration establishes these exact crash transitions, not a complete original gameplay qualification.' };
  check('Space Race exact named crash transitions match original source capture', equal(spaceEvents, originalCrashEvents));
  check('Space Race has explicit unsupported attract/HIT semantics', baselines.get(2).final.attract_n === 4294967295 && baselines.get(2).final.hits === 0);
  // Games ported from 0.2.0 on (core/games/<id>.cpp): the generic contract.
  const cString = (pointer) => { let end = pointer; while (core.HEAPU8[end]) end += 1; return Buffer.from(core.HEAPU8.subarray(pointer, end)).toString('latin1'); };
  report.registered_games = []; report.rom_games_checked = []; report.rom_games_skipped = [];
  const manifest = JSON.parse(await readFile(new URL('../tests/fixtures/game-manifest.json', import.meta.url), 'utf8'));
  for (let id = 6; id < 32; id += 1) {
    const info = (field) => core._nocpu_game_info(id, field) >>> 0;
    if (info(0) !== 1) { check(`ID ${id}: unregistered ID has no name or create`, core._nocpu_game_name(id) === 0 && core._nocpu_create_game(id, 848, 0, 0) === 0); continue; }
    const game = { id, name: cString(core._nocpu_game_name(id)), dip: info(7), pot: info(11), paddles: info(1), joysticks: info(2),
      directions: info(3), buttonSlots: info(4), buttons: info(5), starts: info(6), mask: info(8), portrait: info(14), wheels: info(15),
      roms: info(16), registered: true };
    report.registered_games.push({ ...game, pot_min: info(9), pot_max: info(10), scores: info(12) });
    if (game.roms) {
      // The core's descriptor slots are the audited manifest's, in order, with
      // the same accepted identities (CRC32 and exact size).
      const audited = manifest.games.find((entry) => entry.id === game.name)?.roms ?? [];
      const declared = Array.from({ length: game.roms }, (_, slot) => {
        const variants = [];
        for (let variant = 0; (core._nocpu_game_rom_size(id, slot, variant) >>> 0) !== 0xffffffff; variant += 1)
          variants.push({ crc32: (core._nocpu_game_rom_crc(id, slot, variant) >>> 0).toString(16).toUpperCase().padStart(8, '0'), size_bytes: core._nocpu_game_rom_size(id, slot, variant) >>> 0 });
        return { expected_member: cString(core._nocpu_game_rom_name(id, slot)), dump_variants: variants };
      });
      check(`${game.name}: ROM slots match the audited manifest`, equal(declared,
        audited.map((rom) => ({ expected_member: rom.expected_member, dump_variants: rom.dump_variants.map((v) => ({ crc32: v.crc32, size_bytes: v.size_bytes })) }))));
      const cold = state();
      check(`${game.name}: creation without its ROMs is refused`, core._nocpu_create_game(id, 848, game.dip, game.pot) === 0
        && core._nocpu_rom_error() === 5 && equal(cold, state()));
      if (!options['rom-dir']) { report.rom_games_skipped.push(game.name); continue; }
      romPayloads.set(game.name, await Promise.all(declared.map(async (rom) => readFile(resolve(options['rom-dir'], game.name, rom.expected_member)))));
      report.rom_games_checked.push(game.name);
    }
    check(`${game.name}: declared contract within the generic ABI`, game.paddles <= 4 && game.joysticks <= 2 && game.buttonSlots <= 4
      && game.buttons <= 3 && game.starts <= 2 && game.portrait <= 1 && game.wheels <= 4 && (game.dip & ~game.mask) === 0
      && info(13) === 1 && info(99) === 4294967295);
    const cold = state();
    check(`${game.name}: invalid settings rejected without mutation`, core._nocpu_create_game(id, 848, (game.mask + 1) >>> 0, game.pot) === 0
      && core._nocpu_create_game(id, 848, game.dip, info(10) ? info(10) + 1 : 1) === 0 && equal(cold, state()));
    const baseline = fresh(`${game.name}: fresh baseline`, game);
    create(game); const before = state();
    check(`${game.name}: declared raster is the created one`, core._nocpu_width() === (game.portrait ? 324 : 576) && core._nocpu_height() === 432);
    check(`${game.name}: undeclared inputs are rejected without mutation`,
      core._nocpu_button(game.buttonSlots, 1, 1) === 0 && core._nocpu_button(0, game.buttons + 1, 1) === 0
      && core._nocpu_joystick_switches(game.joysticks, 1, 0, 0, 0) === 0 && core._nocpu_start_player(game.starts + 1, 1) === 0
      && core._nocpu_coin_channel(2, 1) === 0 && core._nocpu_wheel(game.wheels, 1) === 0 && core._nocpu_wheel_keys(game.wheels, 1, 0) === 0
      && core._nocpu_serve(1) === 0 && equal(before, state()));
    core._nocpu_destroy();
    const ignored = capture(`${game.name}: unsupported channels`, (create(game), game), [...playScript(game),
      action(1400, 'paddle', game.paddles, -32768), action(1400, 'joystick', 0, 1, 1), action(1400, 'switches', game.joysticks, [1, 1, 1, 1])]);
    core._nocpu_destroy();
    check(`${game.name}: unsupported channels have no media/event/state effect`, equal(ignored, baseline));
    create(game); core._nocpu_coin(1); core._nocpu_start_player(1, 1);
    for (let slot = 0; slot < game.paddles; slot += 1) core._nocpu_paddle(slot, slot % 2 ? 32767 : -32768);
    for (let slot = 0; slot < game.joysticks; slot += 1) core._nocpu_joystick_switches(slot, game.directions & 1, 0, (game.directions >> 2) & 1, 0);
    for (let slot = 0; slot < game.buttonSlots; slot += 1) for (let button = 1; button <= game.buttons; button += 1) core._nocpu_button(slot, button, 1);
    for (let slot = 0; slot < game.wheels; slot += 1) core._nocpu_wheel_keys(slot, 1, 0);
    check(`${game.name}: held-input warmup`, core._nocpu_advance(100000) === 1);
    check(`${game.name}: held-input reset keeps the selected settings`, core._nocpu_reset(848) === 1 && core._nocpu_dip() === game.dip && core._nocpu_pot_ohms() === game.pot);
    const reset = capture(`${game.name}: held-input reset`, game); core._nocpu_destroy();
    check(`${game.name}: reset media/events/time exactly match fresh machine`, equal(reset, baseline));
    for (let slot = 0; slot < game.paddles; slot += 1) {
      const moved = fresh(`${game.name}: paddle ${slot + 1}`, game, [...playScript(game), action(1400, 'paddle', slot, slot % 2 ? 32767 : -32768)]);
      check(`${game.name}: paddle ${slot + 1} changes the generated court`, moved.streams.rgba !== baseline.streams.rgba);
    }
    for (let slot = 0; slot < game.wheels; slot += 1) {
      const turned = fresh(`${game.name}: wheel ${slot + 1}`, game, [...playScript(game), action(1400, 'wheel', slot, 32767)]);
      check(`${game.name}: wheel ${slot + 1} changes the generated game`, turned.streams.rgba !== baseline.streams.rgba);
    }
  }
  core._nocpu_destroy(); core._nocpu_destroy();
  check('repeatable destruction releases output/clock', core._nocpu_frame() === 0 && core._nocpu_audio_count() === 0 && core._nocpu_event_count() === 0 && time() === 0n && core._nocpu_advance(1) === 0);
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  core?._nocpu_destroy();
  report.completed_checks = report.checks.length;
  report.passed_checks = report.checks.filter((item) => item.passed).length;
  report.event_overflow_challenge = { performed: false, limitation: 'No independently established native workload exceeds the bounded queue; normal queue drain and overrun getters were measured.' };
  await mkdir(dirname(resolve(options.output)), { recursive: true });
  await writeFile(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Wasm game ABI probe: ${report.passed ? 'PASS' : 'FAIL'}; ${report.passed_checks}/${report.completed_checks} checks; ${resolve(options.output)}\n`);
}
