#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Real ABI4 fault/lifecycle probe. Private canonical members stay outside checkout.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const options = { module: 'build/core/wasm/nocpu.js', 'rom-dir': '', output: 'build/core/rom-abi-probe.json', focus: 'full' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || !process.argv[i + 1]) throw new Error('Unknown or incomplete option');
  options[key] = process.argv[i + 1];
}
if (!options['rom-dir']) throw new Error('Private canonical ROM directory required; missing fixtures are not a pass.');
if (!['full', 'stage-isolation'].includes(options.focus)) throw new Error('Unsupported probe focus.');
const games = [
  { id: 4, name: 'stuntcycle', dip: 76, pot: 0, members: [['82s123.4d', 32], ['82s115.1fh', 512]] },
  { id: 5, name: 'indy4', dip: 0, pot: 720000, members: [['indy.s1', 512], ['indy.s2', 32], ['indy.c1', 512], ['indy.c2', 32]] },
];
const report = { schema_version: 1, focus: options.focus, checks: [], construction_pcm: [], limitations: ['ABI/lifecycle and deterministic reset evidence; original gameplay/media/browser/device fidelity are separate gates.'] };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
let core;
function check(name, passed) {
  report.checks.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}
const time = () => `${core._nocpu_time_hi() >>> 0}:${core._nocpu_time_lo() >>> 0}`;
function identity() { return JSON.stringify([core._nocpu_game(), core._nocpu_dip(), core._nocpu_pot_ohms(), time(), core._nocpu_frame_number()]); }
function stage(game) {
  check(`${game.name} begin`, core._nocpu_rom_begin(game.id) === 1);
  game.payloads.forEach((bytes, slot) => {
    const pointer = core._nocpu_rom_buffer(slot, bytes.length);
    check(`${game.name} buffer ${slot}`, pointer !== 0);
    core.HEAPU8.set(bytes, pointer);
  });
  check(`${game.name} finish`, core._nocpu_rom_finish() === 1);
}
function create(game) { check(`${game.name} create`, core._nocpu_create_game(game.id, 848, game.dip, game.pot) === 1); }
function capture(game) {
  // Preserve and fingerprint constructor-generated PCM separately. With no
  // active mono hookup, original Audio::audio_output still initializes once;
  // absence of ongoing sound must not discard or fabricate that sample.
  const initialCount = core._nocpu_audio_count();
  const initialPCM = core.HEAPU8.slice(core._nocpu_audio(), core._nocpu_audio() + initialCount * 2);
  const initialPCMHash = sha(initialPCM);
  report.construction_pcm.push({ game: game.name, samples: initialCount, values: Array.from(new Int16Array(initialPCM.buffer)), sha256: initialPCMHash });
  check(`${game.name} original constructor PCM exact`, initialCount === 1 && initialPCM.length === 2 && initialPCM[0] === 0 && initialPCM[1] === 0);
  core._nocpu_audio_clear();
  const hash = createHash('sha256');
  for (let i = 0; i < 100; i++) {
    check(`${game.name} bounded advance ${i}`, core._nocpu_advance(5000) === 1);
    const offset = core._nocpu_frame();
    hash.update(core.HEAPU8.subarray(offset, offset + core._nocpu_width() * core._nocpu_height() * 4));
    check(`${game.name} inherited absent PCM ${i}`, core._nocpu_audio_count() === 0);
    core._nocpu_events_clear(); core._nocpu_collisions_clear();
  }
  return JSON.stringify({ construction_samples: initialCount, construction_pcm_sha256: initialPCMHash, hash: hash.digest('hex'), time: time(), frames: core._nocpu_frame_number(), scores: [0, 1, 2, 3].map((slot) => core._nocpu_score(slot)),
    signals: game.id === 4 ? Array.from({ length: 8 }, (_, s) => core._nocpu_stuntcycle_signal(s)) : [0, 1, 2, 3].map((slot) => Array.from({ length: 9 }, (_, s) => core._nocpu_indy4_signal(slot, s))) });
}
try {
  report.tool_sha256 = sha(await readFile(new URL(import.meta.url)));
  report.module_sha256 = sha(await readFile(resolve(options.module)));
  report.wasm_sha256 = sha(await readFile(resolve(dirname(options.module), 'nocpu.wasm')));
  const factory = (await import(pathToFileURL(resolve(options.module)).href)).default;
  core = await factory({ print: () => {}, printErr: () => {} });
  check('ABI5 required', core._nocpu_abi_version() === 5);
  for (const game of games) {
    game.payloads = await Promise.all(game.members.map(async ([name, size]) => {
      const bytes = new Uint8Array(await readFile(resolve(options['rom-dir'], game.name, name)));
      check(`${game.name} private member size ${name}`, bytes.length === size);
      return bytes;
    }));
    core._nocpu_destroy();
    if (options.focus === 'stage-isolation') {
      stage(game);
      for (const [id, dip, pot] of [[0, 0, 0], [1, 0, 0], [2, 0, 970000], [3, 3, 0]]) {
        check(`${game.name} stage rejects old game ${id}`, core._nocpu_create_game(id, 848, dip, pot) === 0 && core._nocpu_rom_error() === 2);
        check(`${game.name} rejected old game leaves no live circuit ${id}`, (core._nocpu_game() >>> 0) === 0xffffffff);
        check(`${game.name} rejected old game preserves exact staged CRC ${id}`, core._nocpu_rom_finish() === 1);
      }
      create(game);
      check(`${game.name} rightful creation retains chosen settings`, core._nocpu_game() === game.id && core._nocpu_dip() === game.dip && core._nocpu_pot_ohms() === game.pot);
      check(`${game.name} rightful owned reset`, core._nocpu_reset(848) === 1);
      core._nocpu_destroy();
      check(`${game.name} destroy after rightful creation`, (core._nocpu_game() >>> 0) === 0xffffffff);
      for (const [id, dip, pot] of [[0, 0, 0], [1, 0, 0], [2, 0, 970000], [3, 3, 0]]) {
        check(`old game ${id} explicit same-game empty stage`, core._nocpu_rom_begin(id) === 1 && core._nocpu_rom_finish() === 1);
        check(`old game ${id} valid explicit-stage launch`, core._nocpu_create_game(id, 848, dip, pot) === 1 && core._nocpu_game() === id);
        core._nocpu_destroy();
        check(`old game ${id} retained unstaged launch`, core._nocpu_create_game(id, 848, dip, pot) === 1 && core._nocpu_game() === id);
        core._nocpu_destroy();
      }
      continue;
    }
    check(`${game.name} missing create rejected`, core._nocpu_create_game(game.id, 848, game.dip, game.pot) === 0);
    check(`${game.name} begin missing`, core._nocpu_rom_begin(game.id) === 1);
    check(`${game.name} missing finish`, core._nocpu_rom_finish() === 0 && core._nocpu_rom_error() === 5);
    check(`${game.name} invalid slot`, core._nocpu_rom_buffer(999, 32) === 0 && core._nocpu_rom_error() === 3);
    check(`${game.name} invalid size`, core._nocpu_rom_buffer(0, game.members[0][1] + 1) === 0 && core._nocpu_rom_error() === 4);
    stage(game);
    const bad = core._nocpu_rom_buffer(0, game.members[0][1]);
    core.HEAPU8.set(game.payloads[0], bad); core.HEAPU8[bad] ^= 1;
    check(`${game.name} corrupt CRC rejected`, core._nocpu_rom_finish() === 0 && core._nocpu_rom_error() === 6);
    stage(game);
    const changedAfterFinish = core._nocpu_rom_buffer(0, game.members[0][1]);
    core.HEAPU8.set(game.payloads[0], changedAfterFinish);
    check(`${game.name} second finish`, core._nocpu_rom_finish() === 1);
    core.HEAPU8[changedAfterFinish] ^= 1;
    check(`${game.name} create rechecks CRC`, core._nocpu_create_game(game.id, 848, game.dip, game.pot) === 0 && core._nocpu_rom_error() === 6);
    stage(game);
    const other = games.find((candidate) => candidate.id !== game.id);
    check(`${game.name} other game staging rejected`, core._nocpu_create_game(other.id, 848, other.dip, other.pot) === 0);
    check(`${game.name} staged selected ROMs reject Pong`, core._nocpu_create(848) === 0 && core._nocpu_rom_error() === 2);
    create(game);
    const live = identity();
    check(`${game.name} live begin busy`, core._nocpu_rom_begin(other.id) === 0 && core._nocpu_rom_error() === 1);
    check(`${game.name} live buffer busy`, core._nocpu_rom_buffer(0, 32) === 0 && core._nocpu_rom_error() === 1);
    check(`${game.name} live finish busy`, core._nocpu_rom_finish() === 0 && core._nocpu_rom_error() === 1);
    check(`${game.name} rejected mutation preserves session`, identity() === live);
    check(`${game.name} invalid wheel slot rejected`, core._nocpu_wheel(4, 10000) === 0);
    check(`${game.name} invalid wheel key slot rejected`, core._nocpu_wheel_keys(4, 1, 1) === 0);
    check(`${game.name} invalid held button slot rejected`, core._nocpu_buttons(4, 1, 1) === 0);
    check(`${game.name} invalid coin channels rejected`, core._nocpu_coin_channel(0, 1) === 0 && core._nocpu_coin_channel(6, 1) === 0);
    if (game.id === 5) {
      check('Indy has no Start or Serve', core._nocpu_start_player(1, 1) === 0 && core._nocpu_start_player(2, 1) === 0 && core._nocpu_serve(1) === 0);
      check('Indy has no throttle', core._nocpu_throttle(32767) === 0 && core._nocpu_throttle_key(1) === 0);
    } else {
      check('Stunt has one coin and no wheel/buttons/Serve', core._nocpu_coin_channel(2, 1) === 0 && core._nocpu_wheel(0, 32767) === 0 && core._nocpu_buttons(0, 1, 1) === 0 && core._nocpu_serve(1) === 0);
    }
    check(`${game.name} invalid inputs do not change state`, identity() === live);
    const first = capture(game);
    check(`${game.name} reset before upload mutation`, core._nocpu_reset(848) === 1);
    // Compare independently captured pre-mutation media against post-mutation.
    game.payloads[0][0] ^= 1;
    check(`${game.name} host upload mutation isolated`, capture(game) === first);
    check(`${game.name} reset retains owned bytes`, core._nocpu_reset(848) === 1);
    check(`${game.name} reset media exact`, capture(game) === first);
    game.payloads[0][0] ^= 1;
    const beforeInvalidReset = identity();
    check(`${game.name} invalid reset settings rejected`, core._nocpu_reset_config(848, game.id === 4 ? 512 : 1, game.pot) === 0);
    check(`${game.name} invalid reset preserves live state`, identity() === beforeInvalidReset);
    const alternatives = game.id === 4 ? [[0, 0], [511, 0], [76 ^ 7, 0], [76 ^ 120, 0], [76 ^ 128, 0], [76 ^ 256, 0]] : [[0, 220000], [0, 1220000]];
    for (const [dip, pot] of alternatives) {
      check(`${game.name} alternate settings reset ${dip}/${pot}`, core._nocpu_reset_config(848, dip, pot) === 1);
      check(`${game.name} alternate settings readback ${dip}/${pot}`, core._nocpu_dip() === dip && core._nocpu_pot_ohms() === pot);
      const altered = capture(game);
      check(`${game.name} alternate settings retained reset ${dip}/${pot}`, core._nocpu_reset(848) === 1 && core._nocpu_dip() === dip && core._nocpu_pot_ohms() === pot);
      check(`${game.name} alternate settings deterministic ${dip}/${pot}`, capture(game) === altered);
    }
    if (game.id === 4) {
      // Every exposed enum choice gets actual construction/readback/reset,
      // separate from representative media above and original award outcomes.
      const allOptions = [
        ...Array.from({ length: 8 }, (_, misses) => (76 & ~7) | misses),
        ...Array.from({ length: 16 }, (_, score) => (76 & ~120) | (score << 3)),
        76, 76 | 128, 76, 76 | 256,
      ];
      for (const dip of allOptions) {
        check(`Stunt exposed option accepted ${dip}`, core._nocpu_reset_config(848, dip, 0) === 1 && core._nocpu_dip() === dip && core._nocpu_pot_ohms() === 0);
        check(`Stunt exposed option retained ${dip}`, core._nocpu_reset(848) === 1 && core._nocpu_dip() === dip && core._nocpu_pot_ohms() === 0);
      }
    }
    core._nocpu_destroy();
    check(`${game.name} destroy discards ROMs`, core._nocpu_create_game(game.id, 848, game.dip, game.pot) === 0);
    check(`${game.name} legacy Pong transition`, core._nocpu_create(848) === 1);
    core._nocpu_destroy(); stage(game); create(game);
    check(`${game.name} mixed lifecycle cold media exact`, capture(game) === first);
    core._nocpu_destroy();
  }
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.code ? `Required local file operation failed (${error.code}).` : error.message; process.exitCode = 1; }
finally {
  core?._nocpu_destroy();
  await mkdir(dirname(resolve(options.output)), { recursive: true });
  await writeFile(resolve(options.output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length }));
}
