#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Pin Pong's free-game select, reconstructed by NoCPU from Atari's schematic
// (docs/PINPONG_SOUND.md). Original DICE has no free-game select, so this is
// a NoCPU-only check through the real Wasm ABI: the same recorded game
// (tests/replays/pinpong-free-game.tsv: one coin, play past 10,000 points,
// let the balls drain, then press Start once more without a coin) is played
// with no free game (DICE's wiring), the 10,000 jumpers and the 20,000
// jumpers. Native/Wasm byte equality of the 10,000 run is checked by
// tools/replay-games.sh through the ordinary runners.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const options = { module: 'build/core/wasm/nocpu.js', output: 'build/core/pinpong-free-game-probe.json',
  replay: 'tests/replays/pinpong-free-game.tsv' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in options) || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option ${process.argv[i]}`);
  options[key] = process.argv[i + 1];
}
const PINPONG = 11, TONE = 1500;
const rows = (await readFile(options.replay, 'utf8')).split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => { const [ms, action, value] = line.trim().split(/\s+/); return { ms: Number(ms), action, value: Number(value) }; });
if (!rows.length || rows.at(-1).action !== 'recreate') throw new Error('The replay must end with recreate.');
const core = await (await import(pathToFileURL(resolve(options.module)).href)).default({ print: () => {}, printErr: () => {} });
const report = { schema_version: 1, seed: 848, replay: options.replay, runs: {}, checks: [],
  scope: 'NoCPU reconstruction from the schematic; original DICE has no free-game select, so there is no original to compare.' };
function check(name, passed, details) {
  report.checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
}

// Play the replay; return per-millisecond telemetry, frame hashes and the
// state after the final Start.
function play(option) {
  const dip = option << 3;
  if (core._nocpu_create_game(PINPONG, 848, dip, TONE) !== 1) throw new Error(`create with free-game option ${option}`);
  const telemetry = [], frames = [];
  let index = 0, lastFrame = 0, lastStart = 0;
  const end = rows.at(-1).ms;
  for (let ms = 0; ms < end; ms += 1) {
    while (index < rows.length && rows[index].ms === ms) {
      const { action, value } = rows[index++];
      if (action === 'coin') core._nocpu_coin(value);
      else if (action === 'start') { core._nocpu_start(value); if (value) lastStart = ms; }
      else if (action === 'button11') core._nocpu_button(0, 1, value);
      else if (action === 'button12') core._nocpu_button(0, 2, value);
      else if (action !== 'recreate') throw new Error(`Unsupported action ${action}`);
    }
    if (core._nocpu_advance(1000) !== 1) throw new Error('advance');
    core._nocpu_audio_clear(); core._nocpu_events_clear(); core._nocpu_collisions_clear();
    telemetry.push([core._nocpu_score(0), core._nocpu_score(1), core._nocpu_active()]);
    const frame = core._nocpu_frame_number();
    if (frame !== lastFrame) {
      lastFrame = frame;
      // The score display (rows 30-75) apart from the rest of the picture.
      const pixels = core.HEAPU8.subarray(core._nocpu_frame(), core._nocpu_frame() + 324 * 432 * 4);
      const digest = (from, to) => createHash('sha256').update(pixels.subarray(from * 324 * 4, to * 324 * 4)).digest('hex');
      frames.push([ms, digest(0, 30) + digest(76, 432), digest(30, 76)]);
    }
  }
  core._nocpu_destroy();
  const games = telemetry.reduce((count, row, ms) => count + (ms > 0 && row[2] && !telemetry[ms - 1][2]), 0);
  const firstEnd = telemetry.findIndex((row, ms) => ms > 0 && !row[2] && telemetry[ms - 1][2]);
  return { telemetry, frames, games, firstEnd, finalStart: lastStart, finalScore: firstEnd > 0 ? telemetry[firstEnd - 1][0] : null,
    activeAfterFinalStart: telemetry[Math.min(telemetry.length - 1, lastStart + 500)][2] };
}

const none = play(0), tenThousand = play(1), twentyThousand = play(2);
for (const [label, run] of [['none', none], ['10000', tenThousand], ['20000', twentyThousand]])
  report.runs[label] = { games: run.games, first_game_end_ms: run.firstEnd, final_counted_score: run.finalScore,
    displayed_score: run.finalScore === null ? null : run.finalScore * 10, final_start_ms: run.finalStart,
    active_after_final_start: run.activeAfterFinalStart };
// The award: C6 reaches the jumpered digit (counted score 1000 = 10,000 shown).
const award = none.telemetry.findIndex((row) => row[0] >= 1000);
report.award_ms = award;
const sameUntil = (run, end) => JSON.stringify(run.telemetry.slice(0, end)) === JSON.stringify(none.telemetry.slice(0, end))
  && JSON.stringify(run.frames.filter(([ms]) => ms < end)) === JSON.stringify(none.frames.filter(([ms]) => ms < end));
check('the recorded game ends with a displayed score between 10,000 and 19,990', none.firstEnd > 0 && none.finalScore >= 1000 && none.finalScore < 2000, report.runs.none);
check('until the score reaches 10,000, the 10,000 jumpers play exactly as DICE\'s wiring (scores, balls, frames)', award > 0 && sameUntil(tenThousand, award));
check('the 20,000 jumpers play exactly as DICE\'s wiring through the whole first game', sameUntil(twentyThousand, none.firstEnd));
// B5.Q-bar also drives the video (H4 pin 12): the free-game indicator lights.
// B5.Q-bar also reaches the video (H4 pin 12 into the score gating, D5): after
// the award the score display blinks; the rest of the picture is unchanged.
const firstDifference = tenThousand.frames.findIndex(([, , score], index) => none.frames[index]?.[2] !== score);
report.first_differing_score_display_ms = firstDifference < 0 ? null : tenThousand.frames[firstDifference][0];
check('10,000 jumpers: after the award the score display blinks within half a second; the rest of the first game\'s picture is unchanged',
  firstDifference >= 0 && report.first_differing_score_display_ms >= award && report.first_differing_score_display_ms <= award + 500
  && JSON.stringify(tenThousand.frames.filter(([ms]) => ms < none.firstEnd).map(([ms, rest]) => [ms, rest]))
    === JSON.stringify(none.frames.filter(([ms]) => ms < none.firstEnd).map(([ms, rest]) => [ms, rest])),
  { award_ms: award, first_differing_score_display_ms: report.first_differing_score_display_ms });
check('no free game (DICE wiring): Start without a coin after the game does not start one', none.games === 1 && !none.activeAfterFinalStart);
check('10,000 jumpers: the score passed 10,000, so Start begins a free game', tenThousand.games === 2 && tenThousand.activeAfterFinalStart
  && tenThousand.telemetry[tenThousand.finalStart + 100][0] === 0);
check('20,000 jumpers: the score stayed below 20,000, so there is no free game', twentyThousand.games === 1 && !twentyThousand.activeAfterFinalStart);
report.passed = report.checks.every((item) => item.passed);
await mkdir(dirname(resolve(options.output)), { recursive: true });
await writeFile(resolve(options.output), JSON.stringify(report, null, 2) + '\n');
console.log(`Pin Pong free-game probe: ${report.passed ? 'PASS' : 'FAIL'}; ${options.output}`);
for (const item of report.checks) console.log(`${item.passed ? 'ok  ' : 'FAIL'} ${item.name}`);
process.exit(report.passed ? 0 : 1);
