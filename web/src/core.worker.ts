// NoCPU hardware access adapter, GPL-3.0-or-later.
// Only the C++ circuit engine advances game state; this worker copies its output.
import type { CoreCommand, CoreEvent, CoreSnapshot } from './protocol';
import { locateCoreAsset } from './asset-identity';
import { coreGameOptions, defaultGameOptions, gameSpec, isGameOptions, isPlayableGameId, normalizeGameOptions,
  type GameOptions, type PlayableGameId } from './game-contract';

class PlayerError extends Error {}

interface DiceModule {
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  _nocpu_abi_version(): number;
  _nocpu_create(seed: number): number;
  _nocpu_create_game(game: number, seed: number, dip: number, potOhms: number): number;
  _nocpu_destroy(): void;
  _nocpu_reset(seed: number): number;
  _nocpu_reset_config(seed: number, dip: number, potOhms: number): number;
  _nocpu_game(): number;
  _nocpu_dip(): number;
  _nocpu_pot_ohms(): number;
  _nocpu_coin(held: number): void;
  _nocpu_start(held: number): void;
  _nocpu_start_player(player: number, held: number): number;
  _nocpu_serve(held: number): number;
  _nocpu_paddle(slot: number, axis: number): void;
  _nocpu_joystick(slot: number, up: number, down: number): void;
  _nocpu_advance(microseconds: number): number;
  _nocpu_frame(): number;
  _nocpu_width(): number;
  _nocpu_height(): number;
  _nocpu_frame_number(): number;
  _nocpu_audio(): number;
  _nocpu_audio_count(): number;
  _nocpu_audio_clear(): void;
  _nocpu_audio_overruns(): number;
  _nocpu_collisions_clear(): void;
  _nocpu_events_clear(): void;
  _nocpu_event_overruns(): number;
  _nocpu_sample_rate(): number;
  _nocpu_score(slot: number): number;
  _nocpu_hits(): number;
  _nocpu_run_n(): number;
  _nocpu_attract_n(): number;
  _nocpu_active(): number;
  _nocpu_crashes(slot: number): number;
  _nocpu_breakout_signal(signal: number): number;
  _nocpu_breakout_count(event: number): number;
  _nocpu_time_lo(): number;
  _nocpu_time_hi(): number;
}

let core: DiceModule | undefined;
let gameId: PlayableGameId = 'pong';
let gameOptions: GameOptions = defaultGameOptions('pong');
let axes: number[] = [];
// Logical display directions: -1 Up/Left,0 neutral,+1 Down/Right. Absolute
// axes/snapshots retain original native polarity; measured spec maps movement.
let directions: number[] = [];
let inputRevision = 0;
let coin = false;
let coinsQueued = 0;
let coinRemainingUs = 0;
let coinReleasedUs = 0;
let start = false;
let startPlayer: 1 | 2 | null = null;
let startsQueued: (1 | 2)[] = [];
let startRemainingUs = 0;
let startReleasedUs = 0;
let serve = false;
let simulatedUs = 0;
let lastFrame = -1;
let running = false;
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let clockAt = 0;
let debtUs = 0;
let sequence = 0;
let outstanding: number | undefined;
let pendingAudio: Int16Array[] = [];
let pendingSamples = 0;
let audioDiscontinuity = false;
let audioTransportDroppedSamples = 0;
let pendingElapsed = 0;

const TICK_MS = 8;
const MAX_DEBT_US = 50000;
const MAX_SLICE_US = 5000;
const CPU_BUDGET_MS = 8;
const MAX_PENDING_SAMPLES = 4800; // 100 ms at the circuit's 48 kHz sample rate.

function send(event: CoreEvent, transfer: Transferable[] = []): void {
  self.postMessage(event, { transfer });
}

function snapshot(): CoreSnapshot {
  if (!core) throw new PlayerError(`${gameSpec(gameId).title} is still loading.`);
  const time = (BigInt(core._nocpu_time_hi() >>> 0) << 32n) | BigInt(core._nocpu_time_lo() >>> 0);
  return {
    gameId,
    options: { ...gameOptions },
    timeps: time.toString(),
    frame: core._nocpu_frame_number(),
    hits: gameId === 'spacerace' || gameId === 'breakout' ? null : core._nocpu_hits(),
    crashes: gameId === 'spacerace' ? [core._nocpu_crashes(0), core._nocpu_crashes(1)] : null,
    breakout: gameId === 'breakout' ? {
      attractPin: core._nocpu_breakout_signal(0), attractN: core._nocpu_breakout_signal(1),
      creditN: core._nocpu_breakout_signal(2), serveWait: core._nocpu_breakout_signal(3),
      player2: core._nocpu_breakout_signal(4), ballCounter: core._nocpu_breakout_signal(5),
      brickHits: core._nocpu_breakout_count(5), paddleHits: core._nocpu_breakout_count(6),
      wallHits: core._nocpu_breakout_count(7),
    } : null,
    scores: [core._nocpu_score(0), core._nocpu_score(1)],
    run: core._nocpu_active() !== 0,
    attract: gameId === 'spacerace' ? null : core._nocpu_attract_n() === 0,
    axes: axes.map(Math.round),
    directions: [...directions],
    coin,
    coinsQueued,
    start,
    startPlayer,
    startsQueued: startsQueued.length,
    serve,
    width: core._nocpu_width(),
    height: core._nocpu_height(),
    pixelFormat: 'rgba8888',
    inputRevision,
    wasmMemoryCapacityBytes: core.HEAPU8.byteLength,
    audioOverruns: core._nocpu_audio_overruns(),
    eventOverruns: core._nocpu_event_overruns(),
    audioTransportDroppedSamples,
  };
}

function releaseHeld(): void {
  directions = Array(gameSpec(gameId).controlSlotCount).fill(0) as number[];
  coin = false;
  coinsQueued = 0;
  coinRemainingUs = 0;
  coinReleasedUs = 0;
  start = false;
  startPlayer = null;
  startsQueued = [];
  startRemainingUs = 0;
  startReleasedUs = 0;
  serve = false;
  core?._nocpu_coin(0);
  core?._nocpu_start(0);
  core?._nocpu_start_player(2, 0);
  core?._nocpu_serve(0);
  if (gameId === 'spacerace') directions.forEach((_, slot) => core?._nocpu_joystick(slot, 0, 0));
}

function stopClock(): void {
  running = false;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  debtUs = 0;
  outstanding = undefined;
  pendingAudio = [];
  pendingSamples = 0;
  pendingElapsed = 0;
  audioDiscontinuity = false;
}

function setClock(nextEpoch: number, shouldRun: boolean): void {
  stopClock();
  epoch = nextEpoch;
  if (!shouldRun) { releaseHeld(); return; }
  running = true;
  clockAt = performance.now();
  timer = setTimeout(tick, TICK_MS);
}

function flushOutput(): void {
  if (!running || outstanding !== undefined || pendingSamples === 0) return;
  const samples = new Int16Array(pendingSamples);
  let offset = 0;
  for (const chunk of pendingAudio) { samples.set(chunk, offset); offset += chunk.length; }
  const audio = samples.buffer;
  const ownSequence = ++sequence;
  outstanding = ownSequence;
  send({ type: 'output', epoch, sequence: ownSequence, audio, audioDiscontinuity,
    snapshot: snapshot(), elapsed: pendingElapsed }, [audio]);
  pendingAudio = [];
  pendingSamples = 0;
  pendingElapsed = 0;
  audioDiscontinuity = false;
}

function tick(): void {
  timer = undefined;
  if (!running || !core) return;
  const started = performance.now();
  const elapsedUs = Math.max(0, started - clockAt) * 1000;
  clockAt = started;
  // This is a bounded wall-clock debt, not a claim that dropped time was
  // simulated. Observations always report the circuit's actual integer clock.
  debtUs = Math.min(MAX_DEBT_US, debtUs + elapsedUs);
  try {
    while (debtUs >= 1000 && performance.now() - started < CPU_BUDGET_MS) {
      if (coinsQueued > 0 && simulatedUs >= 500000 && coinRemainingUs === 0 && coinReleasedUs === 0) {
        coinsQueued -= 1;
        coin = true;
        coinRemainingUs = 100000;
        core._nocpu_coin(1);
      }
      // Coin and Start are separate original switches. A user's explicit Start
      // can queue behind a coin pulse, but inserting a coin never queues Start.
      if (startsQueued.length > 0 && simulatedUs >= 500000 && coinsQueued === 0
        && coinRemainingUs === 0 && coinReleasedUs === 0 && startRemainingUs === 0 && startReleasedUs === 0) {
        startPlayer = startsQueued.shift()!;
        start = true;
        startRemainingUs = 100000;
        if (core._nocpu_start_player(startPlayer, 1) !== 1) throw new PlayerError('The selected Start switch is unsupported. Reload the game.');
      }
      let microseconds = Math.min(MAX_SLICE_US, Math.floor(debtUs));
      if (coinsQueued > 0 && simulatedUs < 500000) microseconds = Math.min(microseconds, 500000 - simulatedUs);
      if (coinRemainingUs > 0) microseconds = Math.min(microseconds, coinRemainingUs);
      if (coinReleasedUs > 0) microseconds = Math.min(microseconds, coinReleasedUs);
      if (startsQueued.length > 0 && simulatedUs < 500000) microseconds = Math.min(microseconds, 500000 - simulatedUs);
      if (startRemainingUs > 0) microseconds = Math.min(microseconds, startRemainingUs);
      if (startReleasedUs > 0) microseconds = Math.min(microseconds, startReleasedUs);
      for (let slot = 0; slot < gameSpec(gameId).paddleCount; slot += 1) {
        if (directions[slot] !== 0) {
          const sign = gameSpec(gameId).paddleAxisSign;
          if (sign === null) throw new PlayerError('This game is awaiting original paddle calibration.');
          axes[slot] = Math.max(-32768, Math.min(32767, axes[slot] + directions[slot] * sign * 32768 * microseconds / 1e6));
          core._nocpu_paddle(slot, Math.round(axes[slot]));
        }
      }
      if (core._nocpu_advance(microseconds) !== 1) throw new PlayerError(`${gameSpec(gameId).title} could not continue. Reload the game to try again.`);
      simulatedUs += microseconds;
      debtUs -= microseconds;
      if (coinReleasedUs > 0) coinReleasedUs -= microseconds;
      if (startReleasedUs > 0) startReleasedUs -= microseconds;
      if (coinRemainingUs > 0) {
        coinRemainingUs -= microseconds;
        if (coinRemainingUs === 0) {
          coin = false;
          core._nocpu_coin(0);
          // Distinct physical coin actions need a release edge observed by
          // DICE's original poll clock, including rapid taps before startup.
          coinReleasedUs = 100000;
        }
      }
      if (startRemainingUs > 0) {
        startRemainingUs -= microseconds;
        if (startRemainingUs === 0) {
          core._nocpu_start_player(startPlayer!, 0);
          start = false;
          startPlayer = null;
          startReleasedUs = 100000;
        }
      }
    }
    const offset = core._nocpu_audio() >>> 1;
    const samples = core.HEAP16.slice(offset, offset + core._nocpu_audio_count());
    core._nocpu_audio_clear();
    core._nocpu_collisions_clear();
    core._nocpu_events_clear();
    // At most one output packet is in transit. A stalled UI keeps a bounded
    // recent PCM queue; explicitly discard stale transport audio on overflow.
    if (pendingSamples + samples.length > MAX_PENDING_SAMPLES) {
      audioTransportDroppedSamples += pendingSamples;
      pendingAudio = [];
      pendingSamples = 0;
      audioDiscontinuity = true;
    }
    if (samples.length) { pendingAudio.push(samples); pendingSamples += samples.length; }
    pendingElapsed += performance.now() - started;
    flushOutput();
    timer = setTimeout(tick, debtUs >= 1000 ? 0 : TICK_MS);
  } catch (error: unknown) {
    stopClock();
    send({ type: 'error', message: error instanceof PlayerError ? error.message : `${gameSpec(gameId).title} stopped unexpectedly. Reload the game to try again.` });
  }
}

async function handle(command: CoreCommand): Promise<void> {
  if (command.type === 'init') {
    if (core) throw new PlayerError('A game is already loaded. Return to the library and choose it again.');
    if (!isPlayableGameId(command.gameId) || !isGameOptions(command.gameId, command.options)) {
      throw new PlayerError('The selected game or settings are unsupported. Return to the library and try again.');
    }
    gameId = command.gameId;
    gameOptions = normalizeGameOptions(gameId, command.options);
    const settings = coreGameOptions(gameId, gameOptions);
    const imported = await import(/* @vite-ignore */ command.moduleUrl);
    const factory = imported.default as (options: Record<string, unknown>) => Promise<DiceModule>;
    core = await factory({
      locateFile: (file: string) => locateCoreAsset(file, command.moduleUrl),
      print: () => {},
      printErr: () => {},
      onAbort: () => send({ type: 'error', message: `${gameSpec(gameId).title} stopped unexpectedly. Reload the game to try again.` }),
    });
    if (core._nocpu_abi_version() !== 3) throw new PlayerError(`${gameSpec(gameId).title} needs an updated game download. Reload this page and try again.`);
    if (core._nocpu_create_game(settings.game, command.seed, settings.dip, settings.potOhms) !== 1) {
      throw new PlayerError(`${gameSpec(gameId).title} could not start. Reload the game to try again.`);
    }
    if (core._nocpu_game() !== settings.game || core._nocpu_dip() !== settings.dip || core._nocpu_pot_ohms() !== settings.potOhms) {
      throw new PlayerError('The game download did not accept the selected settings. Reload and try again.');
    }
    axes = Array(gameSpec(gameId).paddleCount).fill(0) as number[];
    directions = Array(gameSpec(gameId).controlSlotCount).fill(0) as number[];
    send({ type: 'ready', width: core._nocpu_width(), height: core._nocpu_height(), sampleRate: core._nocpu_sample_rate(), snapshot: snapshot() });
    return;
  }
  if (!core) throw new PlayerError(`${gameSpec(gameId).title} is still loading.`);
  switch (command.type) {
    case 'inputs':
      if (command.axes.length !== gameSpec(gameId).paddleCount
        || command.axes.some((axis) => axis !== null && !Number.isFinite(axis))) {
        throw new PlayerError('The control input is unsupported. Return to the game and try again.');
      }
      command.axes.forEach((axis, slot) => {
        if (axis === null) return;
        axes[slot] = Math.round(Math.max(-32768, Math.min(32767, axis)));
        core!._nocpu_paddle(slot, axes[slot]);
      });
      inputRevision = command.revision;
      break;
    case 'keys':
      if (command.directions.length !== gameSpec(gameId).controlSlotCount
        || command.directions.some((direction) => !Number.isFinite(direction))) {
        throw new PlayerError('The control input is unsupported. Return to the game and try again.');
      }
      directions = command.directions.map((direction) => Math.sign(direction));
      if (gameId === 'spacerace') directions.forEach((direction, slot) => {
        core!._nocpu_joystick(slot, Number(direction < 0), Number(direction > 0));
      });
      break;
    case 'coin':
      if (coinsQueued >= 8) throw new PlayerError('Too many coins are queued. Reload the game and insert coins more slowly.');
      coinsQueued += 1;
      break;
    case 'start': {
      const player = command.player ?? 1;
      if (player !== 1 && player !== 2) throw new PlayerError('The selected Start switch is unsupported. Reload the game.');
      if (!gameSpec(gameId).hasStart) break;
      if (player > gameSpec(gameId).startButtons) throw new PlayerError('The selected Start switch is unsupported. Reload the game.');
      if (startsQueued.length >= 8) throw new PlayerError('Too many starts are queued. Reload the game and press Start more slowly.');
      startsQueued.push(player);
      break;
    }
    case 'serve':
      if (typeof command.held !== 'boolean' || !gameSpec(gameId).hasServe) throw new PlayerError('The selected Serve switch is unsupported. Reload the game.');
      if (core._nocpu_serve(Number(command.held)) !== 1) throw new PlayerError('The selected Serve switch is unsupported. Reload the game.');
      serve = command.held;
      break;
    case 'release':
      releaseHeld();
      break;
    case 'clock':
      setClock(command.epoch, command.running);
      break;
    case 'ack':
      if (command.epoch === epoch && command.sequence === outstanding) {
        outstanding = undefined;
        flushOutput();
      }
      break;
    case 'frame': {
      if (command.epoch !== epoch || !running) break;
      let pixels: ArrayBuffer | null = null;
      const frame = core._nocpu_frame_number();
      if (frame !== lastFrame) {
        const offset = core._nocpu_frame();
        const length = core._nocpu_width() * core._nocpu_height() * 4;
        pixels = core.HEAPU8.slice(offset, offset + length).buffer;
        lastFrame = frame;
      }
      send({ type: 'frame', epoch, pixels }, pixels ? [pixels] : []);
      break;
    }
    case 'reset': {
      if (!isGameOptions(gameId, command.options)) throw new PlayerError('The selected settings are unsupported. Choose the settings again.');
      const nextOptions = normalizeGameOptions(gameId, command.options);
      const settings = coreGameOptions(gameId, nextOptions);
      stopClock();
      releaseHeld();
      if (core._nocpu_reset_config(command.seed, settings.dip, settings.potOhms) !== 1) {
        throw new PlayerError(`${gameSpec(gameId).title} could not reset. Reload the game to try again.`);
      }
      if (core._nocpu_game() !== settings.game || core._nocpu_dip() !== settings.dip || core._nocpu_pot_ohms() !== settings.potOhms) {
        throw new PlayerError('The game download did not accept the selected settings. Reload and try again.');
      }
      gameOptions = nextOptions;
      axes = Array(gameSpec(gameId).paddleCount).fill(0) as number[];
      simulatedUs = 0;
      lastFrame = -1;
      epoch = command.epoch;
      send({ type: 'reset', id: command.id, epoch, snapshot: snapshot() });
      setClock(command.epoch, command.running);
      break;
    }
    case 'snapshot':
      send({ type: 'snapshot', id: command.id, snapshot: snapshot() });
      break;
    case 'destroy':
      stopClock();
      core._nocpu_destroy();
      core = undefined;
      self.close();
      break;
  }
}

// Commands remain ordered even while the Emscripten module is loading.
let commands = Promise.resolve();
self.addEventListener('message', (event: MessageEvent<CoreCommand>) => {
  commands = commands.then(() => handle(event.data)).catch((error: unknown) => {
    send({ type: 'error', message: error instanceof PlayerError ? error.message : `${gameSpec(gameId).title} could not load. Check your connection and reload the game.` });
  });
});
