#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Drive the public Wasm ABI, independently of the browser and native runner.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWriteStream } from 'node:fs';
import { createGzip, gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const options = { module: 'build/core/wasm/nocpu.js', output: 'build/core/wasm-evidence', replay: 'tests/replays/pong.tsv', seed: 848, epochs: 2, game: 'pong', dip: 0, potOhms: 0, romDir: '', snapshotEncoding: 'raw' };
let dipProvided = false;
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '').replace('pot-ohms', 'potOhms').replace('rom-dir', 'romDir').replace('snapshot-encoding', 'snapshotEncoding');
  if (!(key in options) || process.argv[i + 1] === undefined) throw new Error(`Invalid argument ${process.argv[i]}`);
  if (key === 'dip') dipProvided = true;
  options[key] = ['seed', 'epochs', 'dip', 'potOhms'].includes(key) ? Number(process.argv[i + 1]) : process.argv[i + 1];
}
if (!Number.isInteger(options.epochs) || options.epochs < 2 || options.epochs > 10) throw new Error('Use 2–10 epochs to test reset isolation.');
const factory = (await import(pathToFileURL(resolve(options.module)).href)).default;
const core = await factory({ print: () => {}, printErr: (message) => { process.stderr.write(`${message}\n`); } });
if (core._nocpu_abi_version() !== 5) throw new Error('Unsupported core ABI.');
// Games ported from 0.2.0 on are registered in the core and describe their
// inputs and settings through nocpu_game_info (core/nocpu.h).
const cString = (pointer) => { let end = pointer; while (core.HEAPU8[end]) end += 1; return Buffer.from(core.HEAPU8.subarray(pointer, end)).toString('latin1'); };
let gameId;
for (let id = 0; id < 32; id += 1) { const name = core._nocpu_game_name(id); if (name && cString(name) === options.game) gameId = id; }
if (gameId === undefined) throw new Error('Unsupported replay game.');
const info = (field) => core._nocpu_game_info(gameId, field) >>> 0;
const registered = info(0) === 1;
const selected = gameId === 4 || gameId === 5;
if (!['raw', 'gzip'].includes(options.snapshotEncoding) || (options.snapshotEncoding === 'gzip' && !selected)) throw new Error('Unsupported selected snapshot encoding.');
if (gameId === 4 && !dipProvided) options.dip = 76;
if (gameId === 5 && options.potOhms === 0) options.potOhms = 720000;
if (gameId === 3 && !dipProvided) options.dip = 3;
if (gameId === 2 && options.potOhms === 0) options.potOhms = 970000;
if (registered && !dipProvided) options.dip = info(7);
if (registered && options.potOhms === 0) options.potOhms = info(11);
const validDip = registered ? Number.isInteger(options.dip) && options.dip >= 0 && (options.dip & ~info(8)) === 0 : gameId === 4 ? options.dip >= 0 && options.dip < 512 : gameId === 5 ? options.dip === 0 : gameId === 3 ? options.dip >= 0 && options.dip < 128 && (options.dip & 15) <= 8 : [0,1].includes(options.dip);
const validPot = registered ? (info(10) === 0 ? options.potOhms === 0 : options.potOhms >= info(9) && options.potOhms <= info(10)) : gameId === 5 ? options.potOhms >= 220000 && options.potOhms <= 1220000 : gameId === 2 ? options.potOhms >= 470000 && options.potOhms <= 1470000 : options.potOhms === 0;
if (!Number.isInteger(options.dip) || !validDip || !Number.isInteger(options.potOhms) || !validPot) throw new Error('Invalid original game options.');
const registeredActions = () => {
  const actions = ['coin', 'recreate', ...(info(6) >= 1 ? ['start'] : []), ...(info(6) >= 2 ? ['start2'] : [])];
  for (let slot = 1; slot <= info(1); slot += 1) actions.push(`paddle${slot}`);
  for (let slot = 1; slot <= info(2); slot += 1) ['up', 'down', 'left', 'right'].forEach((name, bit) => { if ((info(3) >> bit) & 1) actions.push(`${name}${slot}`); });
  for (let slot = 1; slot <= info(4); slot += 1) for (let button = 1; button <= info(5); button += 1) actions.push(`button${slot}${button}`);
  return actions;
};
const allowed = registered ? registeredActions() : gameId === 5 ? ['coin','dollar','recreate', ...[1,2,3,4].flatMap((p) => ['coin','gas','brake','wheel','left','right'].map((key) => `${key}${p}`))]
  : gameId === 4 ? ['coin','start','start2','throttle','throttlekey','recreate']
  : gameId === 3 ? ['coin','start','start2','serve','paddle1','recreate'] : gameId === 2 ? ['coin','start','up1','down1','up2','down2','recreate']
  : gameId === 1 ? ['coin','start','paddle1','paddle2','paddle3','paddle4','recreate'] : ['coin','paddle1','paddle2','recreate'];
const events = (await readFile(options.replay, 'utf8')).split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).map((line) => {
  const [milliseconds, action, value, extra] = line.trim().split(/\s+/);
  if (extra || !allowed.includes(action) || !Number.isInteger(Number(milliseconds)) || Number(milliseconds) > 1000000 || !Number.isInteger(Number(value))) throw new Error('Invalid replay row.');
  if (action.startsWith('paddle') || action.startsWith('wheel') ? Number(value) < -32768 || Number(value) > 32767 : action === 'throttle' ? Number(value) < 0 || Number(value) > 32767 : ![0, 1].includes(Number(value))) throw new Error('Replay input outside physical range.');
  return { time: BigInt(milliseconds) * 1_000_000_000n, action, value: Number(value) };
});
if (!events.length || events.at(-1).action !== 'recreate' || events.at(-1).time <= 0n || events.at(-1).value !== 1
  || events.slice(0, -1).some((event) => event.action === 'recreate')
  || events.some((event, i) => event.time < 0n || (i && event.time < events[i - 1].time))) throw new Error('Replay must be ordered and finish with recreate.');
const ps = (prefix = 'time') => (BigInt(core[`_nocpu_${prefix}_hi`]() >>> 0) << 32n) | BigInt(core[`_nocpu_${prefix}_lo`]() >>> 0);
let width = core._nocpu_width(), height = core._nocpu_height();
if (width !== 576 || height !== 432 || core._nocpu_sample_rate() !== 48000) throw new Error('Unexpected native media dimensions or sample rate.');
if (core._nocpu_advance(1) !== 0 || core._nocpu_audio_count() !== 0 || core._nocpu_frame() !== 0) throw new Error('Uncreated core advanced or exposed output.');

function nativeFrameHash(rgba, frameWidth = width, frameHeight = height) {
  // Exact 64-bit FNV-1a using two words; no 53-bit floating point time/hash loss.
  let lo = 0x84222325, hi = 0xcbf29ce4;
  for (let y = frameHeight - 1; y >= 0; y -= 1) for (let x = 0; x < frameWidth; x += 1) for (let c = 0; c < 3; c += 1) {
    lo = (lo ^ rgba[(y * frameWidth + x) * 4 + c]) >>> 0;
    const product = lo * 435;
    hi = (hi * 435 + lo * 256 + Math.floor(product / 4294967296)) >>> 0;
    lo = product >>> 0;
  }
  return ((BigInt(hi) << 32n) | BigInt(lo)).toString();
}

if (selected) {
  if (!options.romDir || core._nocpu_rom_begin(gameId) !== 1) throw new Error('Trusted private ROM input required.');
  const members = gameId === 4 ? [['82s123.4d',32],['82s115.1fh',512]] : [['indy.s1',512],['indy.s2',32],['indy.c1',512],['indy.c2',32]];
  for (let slot = 0; slot < members.length; slot += 1) {
    const [name,size] = members[slot];
    let data;try { data = await readFile(resolve(options.romDir,options.game,name)); } catch { throw new Error('Private descriptor input unavailable.'); }
    if (data.length !== size) throw new Error('Private descriptor size invalid.');
    const pointer = core._nocpu_rom_buffer(slot,size);if (!pointer) throw new Error('Owned ROM buffer rejected.');
    core.HEAPU8.set(data,pointer);
  }
  if (core._nocpu_rom_finish() !== 1) throw new Error('Private ROM CRC verification failed.');
}
for (let epoch = 0; epoch < options.epochs; epoch += 1) {
  const made = epoch ? core._nocpu_reset(options.seed) : core._nocpu_create_game(gameId, options.seed, options.dip, options.potOhms);
  if (made !== 1) throw new Error('Core creation/reset failed.');
  width = core._nocpu_width(); height = core._nocpu_height();
  if (width !== (gameId === 3 ? 324 : 576) || height !== 432) throw new Error('Selected native viewport differs from the measured original.');
  if (core._nocpu_game() !== gameId || core._nocpu_dip() !== options.dip || core._nocpu_pot_ohms() !== options.potOhms) throw new Error('Native selected game/configuration mismatch.');
  const initialCount = core._nocpu_audio_count();
  if (core._nocpu_create(options.seed) !== 0 || core._nocpu_advance(100001) !== 0 || core._nocpu_advance(0) !== 1 || ps() !== 0n || core._nocpu_frame_number() !== 0 || core._nocpu_audio_count() !== initialCount) throw new Error('ABI lifetime/bounded-step contract violated.');
  const directory = resolve(options.output, `epoch${epoch}`);
  await mkdir(directory, { recursive: true });
  const scoreSlots = registered ? Math.max(2, info(12)) : 2;
  const frames = ['frame,time_ps,fnv1a64\n'], telemetry = [`time_ps,${Array.from({ length: scoreSlots }, (_, slot) => `score${slot + 1}`).join(',')},run_n,attract_n,hits${gameId === 0 ? '\n' : ',active\n'}`];
  const inputs = ['requested_ps,applied_ps,action,value\n'], collisions = ['time_ps,hit_output\n'];
  const transitions = ['time_ps,signal,value\n'], directions = [[0, 0], [0, 0]], sticks = [[0, 0, 0, 0], [0, 0, 0, 0]], keys = Array.from({length:4},()=>[0,0]), buttons = Array.from({length:4},()=>[0,0]);
  const hardware = [gameId === 4 ? 'time_ps,attract_n,player_control,jump,flip,good_jump,bad_jump,miss_counter,credit,throttle_milli,score1,score2\n' : `time_ps,play,endgame_n,credit_n${[1,2,3,4].map((p)=>`,car${p}_attract,car${p}_collision,car${p}_heading,car${p}_speed,car${p}_lap,car${p}_score_code,car${p}_displayed_score`).join('')}\n`];
  const geometry = ['frame,time_ps,width,height\n'];
  let gzip, outputStream, gzipDone;
  if (selected) {
    gzip=createGzip({level:1});outputStream=createWriteStream(resolve(directory,'frames.rgb.gz'));gzip.pipe(outputStream);
    gzipDone=Promise.all([finished(gzip),finished(outputStream)]);
  }
  const pcm = [], gray = [], snapshots = [250,399,633,799,866,999,1000,1132,1166,1232,1316,1382,1500,1800,2000,2100,2200,2250,2300,2400,2500,2600,2700,2750,3000,3200,3250,3300,3400,3500,3600,3700,3750,3800,3900,4000,4250,4500,4750,5000,5250,5500,5750,6000,6500,7500,8000,8500,9000,9500,10000,10500,11000,11500,12000,13000,15000,20000,30000,45000,60000,80000,110000,130000,170000];
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
    const countEvents = core._nocpu_event_count(), eventOffset = core._nocpu_events() >>> 2;
    for (let i = 0; i < countEvents; i += 1) {
      const time = (BigInt(core.HEAPU32[eventOffset + i * 4 + 1]) << 32n) | BigInt(core.HEAPU32[eventOffset + i * 4]);
      const signal = core.HEAPU32[eventOffset + i * 4 + 2];
      if (gameId === 3 && (signal < 5 || signal > 10)) throw new Error('Unexpected Breakout native source signal.');
      // Original observer IDs100..105 name the same six independently mapped pins.
      transitions.push(`${time},${gameId === 3 ? signal + 95 : signal},${core.HEAPU32[eventOffset + i * 4 + 3]}\n`);
    }
    core._nocpu_events_clear();
    if (core._nocpu_audio_overruns() !== 0) throw new Error('Core PCM overflow.');
    if (core._nocpu_event_overruns() !== 0) throw new Error('Core native event overflow.');
  }
  drain();
  while (true) {
    const now = ps();
    telemetry.push(`${now},${Array.from({ length: scoreSlots }, (_, slot) => core._nocpu_score(slot)).join(',')},${core._nocpu_run_n()},${core._nocpu_attract_n() >>> 0},${core._nocpu_hits()}${gameId === 0 ? '' : `,${core._nocpu_active()}`}\n`);
    if (selected) {
      const values = gameId === 4 ? [...Array.from({length:8},(_,i)=>core._nocpu_stuntcycle_signal(i)),core._nocpu_stuntcycle_throttle(),core._nocpu_score(0),core._nocpu_score(1)]
        : [...Array.from({length:3},(_,i)=>core._nocpu_indy4_signal(0,i)),...[0,1,2,3].flatMap((p)=>[...Array.from({length:6},(_,i)=>core._nocpu_indy4_signal(p,i+3)),core._nocpu_score(p)])];
      hardware.push(`${now},${values.join(',')}\n`);
    }
    while (eventIndex < events.length && events[eventIndex].time <= now) {
      const event = events[eventIndex++];
      inputs.push(`${event.time},${now},${event.action},${event.value}\n`);
      if (registered && event.action !== 'recreate') {
        let accepted = 1;
        if (event.action === 'coin') accepted = core._nocpu_coin_channel(1, event.value);
        else if (event.action === 'start' || event.action === 'start2') accepted = core._nocpu_start_player(event.action === 'start' ? 1 : 2, event.value);
        else if (event.action.startsWith('paddle')) core._nocpu_paddle(Number(event.action.at(-1)) - 1, event.value);
        else if (event.action.startsWith('button')) accepted = core._nocpu_button(Number(event.action[6]) - 1, Number(event.action[7]), event.value);
        else {
          const slot = Number(event.action.at(-1)) - 1;
          sticks[slot][['up', 'down', 'left', 'right'].indexOf(event.action.slice(0, -1))] = event.value;
          accepted = core._nocpu_joystick_switches(slot, ...sticks[slot]);
        }
        if (accepted !== 1) throw new Error(`Registered game input rejected: ${event.action}`);
        continue;
      }
      if (event.action === 'coin') core._nocpu_coin(event.value);
      else if (event.action === 'start') {
        if (gameId === 3) { if (core._nocpu_start_player(1, event.value) !== 1) throw new Error('Native Start1 rejected.'); }
        else core._nocpu_start(event.value);
      }
      else if (event.action === 'start2') { if (core._nocpu_start_player(2, event.value) !== 1) throw new Error('Native Start2 rejected.'); }
      else if (event.action === 'serve') { if (core._nocpu_serve(event.value) !== 1) throw new Error('Native Serve rejected.'); }
      else if (event.action === 'throttle' || event.action === 'throttlekey') { if (core[event.action === 'throttle' ? '_nocpu_throttle' : '_nocpu_throttle_key'](event.value) !== 1) throw new Error('Throttle rejected.'); }
      else if (event.action === 'dollar' || /^coin[1-4]$/.test(event.action)) { if (core._nocpu_coin_channel(event.action === 'dollar' ? 5 : Number(event.action.at(-1)),event.value) !== 1) throw new Error('Coin channel rejected.'); }
      else if (/^wheel[1-4]$/.test(event.action)) { if (core._nocpu_wheel(Number(event.action.at(-1))-1,event.value) !== 1) throw new Error('Wheel rejected.'); }
      else if (/^(left|right)[1-4]$/.test(event.action)) { const p=Number(event.action.at(-1))-1;keys[p][event.action.startsWith('left')?0:1]=event.value;if(core._nocpu_wheel_keys(p,...keys[p])!==1)throw new Error('Wheel keys rejected.'); }
      else if (/^(gas|brake)[1-4]$/.test(event.action)) { const p=Number(event.action.at(-1))-1;buttons[p][event.action.startsWith('gas')?0:1]=event.value;if(core._nocpu_buttons(p,...buttons[p])!==1)throw new Error('Driving buttons rejected.'); }
      else if (event.action.startsWith('paddle')) core._nocpu_paddle(Number(event.action.at(-1)) - 1, event.value);
      else if (/^(up|down)[12]$/.test(event.action)) {
        const slot = Number(event.action.at(-1)) - 1, direction = event.action.startsWith('up') ? 0 : 1;
        directions[slot][direction] = event.value;
        core._nocpu_joystick(slot, ...directions[slot]);
      }
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
      if (selected) {
        const fullRGB=Buffer.alloc(width*height*3);let offset=0;
        for(let y=height-1;y>=0;y-=1)for(let x=0;x<width;x+=1)for(let c=0;c<3;c+=1)fullRGB[offset++]=rgba[(y*width+x)*4+c];
        if(!gzip.write(fullRGB))await once(gzip,'drain');
        geometry.push(`${frame-1},${frameTime},${width},${height}\n`);
      }
      const observation = Buffer.alloc(160 * 120);
      for (let y = 0; y < 120; y += 1) for (let x = 0; x < 160; x += 1) observation[y * 160 + x] = rgba[(Math.floor(y * height / 120) * width + Math.floor(x * width / 160)) * 4];
      gray.push(observation);
      if (snapshotIndex < snapshots.length && frameTime >= BigInt(snapshots[snapshotIndex]) * 1_000_000_000n) {
        const rgb = Buffer.alloc(width * height * 3);
        for (let i = 0; i < width * height; i += 1) for (let c = 0; c < 3; c += 1) rgb[i * 3 + c] = rgba[i * 4 + c];
        const snapshotBytes = Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), rgb]);
        const compressed = options.snapshotEncoding === 'gzip';
        await writeFile(resolve(directory, `${snapshots[snapshotIndex++]}ms.ppm${compressed ? '.gz' : ''}`), compressed ? gzipSync(snapshotBytes, { level: 1 }) : snapshotBytes);
      }
      lastFrame = frame;
    }
  }
  await Promise.all(Object.entries({ 'frames.csv': frames.join(''), 'frames.gray': Buffer.concat(gray), 'telemetry.csv': telemetry.join(''), 'inputs.csv': inputs.join(''), 'collisions.csv': collisions.join(''), 'events.csv': transitions.join(''), 'audio.s16le': Buffer.concat(pcm) }).map(([name, data]) => writeFile(resolve(directory, name), data)));
  if(selected) {
    gzip.end();await gzipDone;
    await Promise.all([writeFile(resolve(directory,'hardware.csv'),hardware.join('')),writeFile(resolve(directory,'frame-geometry.csv'),geometry.join('')),writeFile(resolve(directory,'audio-boundary.json'),JSON.stringify({constructor_samples:initialCount,total_samples:Buffer.concat(pcm).length/2,ongoing_samples:Buffer.concat(pcm).length/2-initialCount})+'\n')]);
  }
  console.log(`Wasm epoch ${epoch}: ${lastFrame} frames; ${Buffer.concat(pcm).length / 2} PCM samples.`);
}
await writeFile(resolve(options.output, 'configuration.json'), `${JSON.stringify({ game: options.game, dip: options.dip, pot_ohms: options.potOhms })}\n`);
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
  const probeWidth = core._nocpu_width(), probeHeight = core._nocpu_height();
  const observed = { frame: nativeFrameHash(core.HEAPU8.slice(core._nocpu_frame(), core._nocpu_frame() + probeWidth * probeHeight * 4), probeWidth, probeHeight), audio: Buffer.concat(audio), time: ps() };
  core._nocpu_destroy();
  return observed;
}
const legal = extremeInputs(-32768, 32767, false), clamped = extremeInputs(-999999, 999999, true);
if (legal.time !== clamped.time || legal.frame !== clamped.frame || !legal.audio.equals(clamped.audio)) throw new Error('Clamped axes/invalid slot changed otherwise equivalent circuit output.');
const fresh = extremeInputs(0, 0, false), heldReset = extremeInputs(0, 0, false, true);
if (fresh.time !== heldReset.time || fresh.frame !== heldReset.frame || !fresh.audio.equals(heldReset.audio)) throw new Error('Held coin/axes survived reset or changed fresh circuit output.');
console.log('Wasm ABI creation, bounds, zero-step, destruction, input-clamping and held-input reset probes passed.');
