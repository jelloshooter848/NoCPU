// NoCPU browser adapter, GPL-3.0-or-later. Circuit behavior comes from DICE.
import type { GameOptions, PlayableGameId } from './game-contract';
export type CoreCommand =
  | { type: 'init'; moduleUrl: string; seed: number; gameId: PlayableGameId; options: GameOptions; roms?: { expectedName: string; bytes: Uint8Array }[] }
  | { type: 'clock'; running: boolean; epoch: number }
  | { type: 'inputs'; axes: (number | null)[]; revision: number }
  | { type: 'keys'; directions: number[] }
  | { type: 'coin'; channel?: 1 | 2 | 3 | 4 | 5 }
  | { type: 'buttons'; gas: boolean[]; brake: boolean[] }
  | { type: 'start'; player?: 1 | 2 }
  | { type: 'serve'; held: boolean }
  | { type: 'release' }
  | { type: 'frame'; epoch: number }
  | { type: 'ack'; epoch: number; sequence: number }
  | { type: 'reset'; id: number; seed: number; epoch: number; running: boolean; options: GameOptions }
  | { type: 'snapshot'; id: number }
  // Debug pages only: suspend wall-clock pacing, or advance exactly this much
  // simulated time while suspended. Both answer with a 'snapshot' event.
  | { type: 'debugHold'; id: number; held: boolean }
  | { type: 'debugStep'; id: number; microseconds: number }
  | { type: 'destroy' };

export interface CoreSnapshot {
  gameId: PlayableGameId;
  options: GameOptions;
  timeps: string;
  frame: number;
  hits: number | null;
  crashes: [number, number] | null;
  breakout: { attractPin: number; attractN: number; creditN: number; serveWait: number;
    player2: number; ballCounter: number; brickHits: number; paddleHits: number; wallHits: number } | null;
  stuntcycle: { signals: number[]; throttle: number } | null;
  indy4: { globals: number[]; cars: number[][]; scores: number[] } | null;
  gas: boolean[];
  brake: boolean[];
  coinChannel: number | null;
  // Completed original switch pulses in this circuit lifetime, not credits or
  // proof that a game accepted a player. Canceled held pulses do not count.
  coinCompleted: number[];
  startCompleted: number[];
  scores: [number, number];
  run: boolean;
  attract: boolean | null;
  axes: number[];
  directions: number[];
  coin: boolean;
  coinsQueued: number;
  start: boolean;
  startPlayer: 1 | 2 | null;
  startsQueued: number;
  serve: boolean;
  width: number;
  height: number;
  pixelFormat: 'rgba8888';
  inputRevision: number;
  wasmMemoryCapacityBytes: number;
  audioOverruns: number;
  eventOverruns: number;
  audioTransportDroppedSamples: number;
}

export type CoreEvent =
  | { type: 'ready'; width: number; height: number; sampleRate: number; snapshot: CoreSnapshot }
  | { type: 'output'; epoch: number; sequence: number; audio: ArrayBuffer; audioDiscontinuity: boolean; snapshot: CoreSnapshot; elapsed: number }
  | { type: 'frame'; epoch: number; pixels: ArrayBuffer | null; frame: number }
  | { type: 'reset'; id: number; epoch: number; snapshot: CoreSnapshot }
  | { type: 'snapshot'; id: number; snapshot: CoreSnapshot }
  | { type: 'error'; message: string };
