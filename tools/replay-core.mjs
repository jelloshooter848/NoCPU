#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Drive the public Wasm ABI, independently of the browser and native runner.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const options = { module: 'build/core/wasm/nocpu.js', output: 'build/core/wasm-evidence', replay: 'tests/replays/pong.tsv', seed: 848, epochs: 2 };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || process.argv[i + 1] === undefined) throw new Error(`Invalid argument ${process.argv[i]}`);
  options[key] = key === 'seed' || key === 'epochs' ? Number(process.argv[i + 1]) : process.argv[i + 1];
}
if (!Number.isInteger(options.epochs) || options.epochs < 2 || options.epochs > 10) throw new Error('Use 2–10 epochs to test reset isolation.');
const events = (await readFile(options.replay, 'utf8')).split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).map((line) => {
  const [milliseconds, action, value, extra] = line.trim().split(/\s+/);
  if (extra || !['coin', 'paddle1', 'paddle2', 'recreate'].includes(action) || !Number.isInteger(Number(milliseconds)) || !Number.isInteger(Number(value))) throw new Error('Invalid replay row.');
  return { time: BigInt(milliseconds) * 1_000_000_000n, action, value: Number(value) };
});
if (!events.length || events.at(-1).action !== 'recreate' || events.some((event, i) => event.time < 0n || (i && event.time < events[i - 1].time))) throw new Error('Replay must be ordered and finish with recreate.');
const factory = (await import(pathToFileURL(resolve(options.module)).href)).default;
const core = await factory({ print: () => {}, printErr: (message) => { process.stderr.write(`${message}\n`); } });
if (core._nocpu_abi_version() !== 1) throw new Error('Unsupported core ABI.');
const ps = (prefix = 'time') => (BigInt(core[`_nocpu_${prefix}_hi`]() >>> 0) << 32n) | BigInt(core[`_nocpu_${prefix}_lo`]() >>> 0);
const width = core._nocpu_width(), height = core._nocpu_height();
if (width !== 576 || height !== 432 || core._nocpu_sample_rate() !== 48000) throw new Error('Unexpected native media dimensions or sample rate.');
if (core._nocpu_advance(1) !== 0 || core._nocpu_audio_count() !== 0 || core._nocpu_frame() !== 0) throw new Error('Uncreated core advanced or exposed output.');

function nativeFrameHash(rgba) {
  // Exact 64-bit FNV-1a using two words; no 53-bit floating point time/hash loss.
  let lo = 0x84222325, hi = 0xcbf29ce4;
  for (let y = height - 1; y >= 0; y -= 1) for (let x = 0; x < width; x += 1) for (let c = 0; c < 3; c += 1) {
    lo = (lo ^ rgba[(y * width + x) * 4 + c]) >>> 0;
    const product = lo * 435;
    hi = (hi * 435 + lo * 256 + Math.floor(product / 4294967296)) >>> 0;
    lo = product >>> 0;
  }
  return ((BigInt(hi) << 32n) | BigInt(lo)).toString();
}

for (let epoch = 0; epoch < options.epochs; epoch += 1) {
  const made = epoch ? core._nocpu_reset(options.seed) : core._nocpu_create(options.seed);
  if (made !== 1) throw new Error('Core creation/reset failed.');
  const initialCount = core._nocpu_audio_count();
  if (core._nocpu_create(options.seed) !== 0 || core._nocpu_advance(100001) !== 0 || core._nocpu_advance(0) !== 1 || ps() !== 0n || core._nocpu_frame_number() !== 0 || core._nocpu_audio_count() !== initialCount) throw new Error('ABI lifetime/bounded-step contract violated.');
  const directory = resolve(options.output, `epoch${epoch}`);
  await mkdir(directory, { recursive: true });
  const frames = ['frame,time_ps,fnv1a64\n'], telemetry = ['time_ps,score1,score2,run_n,attract_n,hits\n'];
  const inputs = ['requested_ps,applied_ps,action,value\n'], collisions = ['time_ps,hit_output\n'];
  const pcm = [], gray = [], snapshots = [250, 1000, 2000, 3000, 6000, 13000, 15000];
  let eventIndex = 0, lastFrame = 0, deadline = 0n, snapshotIndex = 0;
  function drain() {
    const count = core._nocpu_audio_count();
    if (count) pcm.push(Buffer.from(core.HEAPU8.slice(core._nocpu_audio(), core._nocpu_audio() + count * 2)));
    core._nocpu_audio_clear();
    const countHits = core._nocpu_collision_count(), offset = core._nocpu_collisions() >>> 2;
    for (let i = 0; i < countHits; i += 1) {
      const time = (BigInt(core.HEAPU32[offset + i * 3 + 1]) << 32n) | BigInt(core.HEAPU32[offset + i * 3]);
      collisions.push(`${time},${core.HEAPU32[offset + i * 3 + 2]}\n`);
    }
    core._nocpu_collisions_clear();
    if (core._nocpu_audio_overruns() !== 0) throw new Error('Core PCM overflow.');
  }
  drain();
  while (true) {
    const now = ps();
    telemetry.push(`${now},${core._nocpu_score(0)},${core._nocpu_score(1)},${core._nocpu_run_n()},${core._nocpu_attract_n()},${core._nocpu_hits()}\n`);
    while (eventIndex < events.length && events[eventIndex].time <= now) {
      const event = events[eventIndex++];
      inputs.push(`${event.time},${now},${event.action},${event.value}\n`);
      if (event.action === 'coin') core._nocpu_coin(event.value);
      else if (event.action === 'paddle1') core._nocpu_paddle(0, event.value);
      else if (event.action === 'paddle2') core._nocpu_paddle(1, event.value);
    }
    if (eventIndex === events.length) break;
    const target = deadline + 1_000_000_000n < events[eventIndex].time ? deadline + 1_000_000_000n : events[eventIndex].time;
    const delta = target - deadline;
    if (delta % 1_000_000n !== 0n || delta <= 0n || core._nocpu_advance(Number(delta / 1_000_000n)) !== 1) throw new Error('Replay requires positive integer microsecond boundaries.');
    deadline = target;
    drain();
    const frame = core._nocpu_frame_number();
    if (frame !== lastFrame) {
      if (frame !== lastFrame + 1) throw new Error('Wasm ABI lost a generated frame.');
      const frameTime = ps('frame_time');
      const rgba = core.HEAPU8.slice(core._nocpu_frame(), core._nocpu_frame() + width * height * 4);
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) throw new Error('Nonopaque circuit frame.');
      frames.push(`${frame - 1},${frameTime},${nativeFrameHash(rgba)}\n`);
      const observation = Buffer.alloc(160 * 120);
      for (let y = 0; y < 120; y += 1) for (let x = 0; x < 160; x += 1) observation[y * 160 + x] = rgba[(Math.floor(y * height / 120) * width + Math.floor(x * width / 160)) * 4];
      gray.push(observation);
      if (snapshotIndex < snapshots.length && frameTime >= BigInt(snapshots[snapshotIndex]) * 1_000_000_000n) {
        const rgb = Buffer.alloc(width * height * 3);
        for (let i = 0; i < width * height; i += 1) for (let c = 0; c < 3; c += 1) rgb[i * 3 + c] = rgba[i * 4 + c];
        await writeFile(resolve(directory, `${snapshots[snapshotIndex++]}ms.ppm`), Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), rgb]));
      }
      lastFrame = frame;
    }
  }
  await Promise.all(Object.entries({ 'frames.csv': frames.join(''), 'frames.gray': Buffer.concat(gray), 'telemetry.csv': telemetry.join(''), 'inputs.csv': inputs.join(''), 'collisions.csv': collisions.join(''), 'audio.s16le': Buffer.concat(pcm) }).map(([name, data]) => writeFile(resolve(directory, name), data)));
  console.log(`Wasm epoch ${epoch}: ${lastFrame} frames; ${Buffer.concat(pcm).length / 2} PCM samples.`);
}
core._nocpu_destroy();
core._nocpu_destroy();
if (core._nocpu_advance(1) !== 0 || core._nocpu_audio_count() !== 0 || core._nocpu_frame() !== 0) throw new Error('Destroyed core retains output.');

// Challenge clamping and invalid slots with two independent equivalent circuits.
function extremeInputs(a, b, invalidSlot, heldReset = false) {
  if (core._nocpu_create(options.seed) !== 1) throw new Error('Post-destroy creation failed.');
  if (heldReset) {
    core._nocpu_paddle(0, -32768); core._nocpu_paddle(1, 32767); core._nocpu_coin(1);
    if (core._nocpu_advance(100000) !== 1 || core._nocpu_reset(options.seed) !== 1 || ps() !== 0n) {
      throw new Error('Held-input reset failed to restore a new circuit clock.');
    }
  }
  if (!heldReset) { core._nocpu_paddle(0, a); core._nocpu_paddle(1, b); }
  if (invalidSlot) core._nocpu_paddle(2, -12345);
  const audio = [];
  for (let i = 0; i < 700; i += 1) {
    if (i === 500) core._nocpu_coin(1);
    if (i === 600) core._nocpu_coin(0);
    if (core._nocpu_advance(1000) !== 1) throw new Error('Extremes probe could not advance.');
    const count = core._nocpu_audio_count();
    audio.push(Buffer.from(core.HEAPU8.slice(core._nocpu_audio(), core._nocpu_audio() + count * 2)));
    core._nocpu_audio_clear();
  }
  const observed = { frame: nativeFrameHash(core.HEAPU8.slice(core._nocpu_frame(), core._nocpu_frame() + width * height * 4)), audio: Buffer.concat(audio), time: ps() };
  core._nocpu_destroy();
  return observed;
}
const legal = extremeInputs(-32768, 32767, false), clamped = extremeInputs(-999999, 999999, true);
if (legal.time !== clamped.time || legal.frame !== clamped.frame || !legal.audio.equals(clamped.audio)) throw new Error('Clamped axes/invalid slot changed otherwise equivalent circuit output.');
const fresh = extremeInputs(0, 0, false), heldReset = extremeInputs(0, 0, false, true);
if (fresh.time !== heldReset.time || fresh.frame !== heldReset.frame || !fresh.audio.equals(heldReset.audio)) throw new Error('Held coin/axes survived reset or changed fresh circuit output.');
console.log('Wasm ABI creation, bounds, zero-step, destruction, input-clamping and held-input reset probes passed.');
