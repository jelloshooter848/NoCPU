#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Wasm core speed on a recorded scenario, in Node, outside any browser.
// Reported, never gated (docs/PERFORMANCE.md). Replays a ROM-free scenario of
// tests/replays/game-scenarios.json through the public ABI the way the browser
// worker does (5 ms advances, PCM/collision/event buffers drained each slice,
// one frame copy per 16.667 wall ms) and prints simulated/wall speed for each
// window of simulated time, so a heavy stretch of play is not averaged away.
// It writes nothing and checks no output; the comparisons do that.
//
//   node tools/bench-core.mjs --scenario hiway-default [--module build/core/wasm/nocpu.js]
//     [--window 10] [--seconds N]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const options = { scenario: '', module: 'build/core/wasm/nocpu.js', window: 10, seconds: 0 };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || process.argv[i + 1] === undefined) throw new Error(`Invalid argument ${process.argv[i]}`);
  options[key] = typeof options[key] === 'number' ? Number(process.argv[i + 1]) : process.argv[i + 1];
}
const scenario = JSON.parse(readFileSync('tests/replays/game-scenarios.json', 'utf8')).scenarios.find((s) => s.id === options.scenario);
if (!scenario) throw new Error('Unknown --scenario; see tests/replays/game-scenarios.json.');
const core = await (await import(pathToFileURL(resolve(options.module)).href)).default({ print() {}, printErr() {} });
if (core._nocpu_create_game(scenario.core_id, 848, scenario.dip, scenario.pot_ohms) !== 1) throw new Error('create failed');
const events = readFileSync(scenario.replay, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
  .map((l) => { const [ms, action, value] = l.trim().split(/\s+/); return { us: Number(ms) * 1000, action, value: Number(value) }; })
  .filter((e) => e.action !== 'recreate');
const end = options.seconds ? options.seconds * 1e6 : Math.max(...readFileSync(scenario.replay, 'utf8').split(/\r?\n/)
  .filter((l) => /\brecreate\b/.test(l)).map((l) => Number(l.trim().split(/\s+/)[0]) * 1000));
const wheelKeys = [0, 1, 2, 3].map(() => [0, 0]), sticks = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
function apply(e) {
  const slot = Number(e.action.match(/(\d)$/)?.[1] ?? 1) - 1;
  let ok;
  if (e.action === 'coin') ok = core._nocpu_coin_channel(1, e.value);
  else if (e.action === 'start') ok = core._nocpu_start_player(1, e.value);
  else if (e.action === 'start2') ok = core._nocpu_start_player(2, e.value);
  else if (/^paddle\d$/.test(e.action)) { core._nocpu_paddle(slot, e.value); ok = 1; }
  else if (/^button\d\d$/.test(e.action)) ok = core._nocpu_button(Number(e.action[6]) - 1, Number(e.action[7]), e.value);
  else if (/^wheel\d$/.test(e.action)) ok = core._nocpu_wheel(slot, e.value);
  else if (/^wheel(left|right)\d$/.test(e.action)) { wheelKeys[slot][e.action.startsWith('wheelleft') ? 0 : 1] = e.value; ok = core._nocpu_wheel_keys(slot, ...wheelKeys[slot]); }
  else if (/^(up|down|left|right)\d$/.test(e.action)) { sticks[slot][['up', 'down', 'left', 'right'].indexOf(e.action.slice(0, -1))] = e.value; ok = core._nocpu_joystick_switches(slot, ...sticks[slot]); }
  else if (/^(up|down)\d$/.test(e.action)) ok = 1;
  else if (e.action === 'serve') ok = core._nocpu_serve(e.value);
  else throw new Error(`Unsupported replay action ${e.action} for this benchmark`);
  if (ok !== 1) throw new Error(`Input ${e.action} rejected`);
}
let now = 0, next = 0, windowStart = 0, windowWall = performance.now(), nextFrame = windowWall;
const startedWall = windowWall, rows = [];
while (now < end) {
  while (next < events.length && events[next].us <= now) apply(events[next++]);
  const step = Math.min(5000, end - now, next < events.length ? events[next].us - now : Infinity);
  if (core._nocpu_advance(step) !== 1) throw new Error('advance failed');
  core.HEAP16.slice(core._nocpu_audio() >>> 1, (core._nocpu_audio() >>> 1) + core._nocpu_audio_count());
  core._nocpu_audio_clear(); core._nocpu_collisions_clear(); core._nocpu_events_clear();
  now += step;
  const wall = performance.now();
  if (wall >= nextFrame) { const o = core._nocpu_frame(); core.HEAPU8.slice(o, o + core._nocpu_width() * core._nocpu_height() * 4); nextFrame += 1000 / 60; }
  if (now - windowStart >= options.window * 1e6 || now >= end) {
    rows.push({ from: windowStart / 1e6, to: now / 1e6, speed: (now - windowStart) / 1e3 / (wall - windowWall) });
    windowStart = now; windowWall = wall;
  }
}
for (const r of rows) console.log(`${options.scenario} ${r.from.toFixed(1)}-${r.to.toFixed(1)} s: ${r.speed.toFixed(2)}x`);
const speeds = rows.map((r) => r.speed);
console.log(`${options.scenario} whole: ${(end / 1e3 / (performance.now() - startedWall)).toFixed(2)}x, slowest window ${Math.min(...speeds).toFixed(2)}x`);
