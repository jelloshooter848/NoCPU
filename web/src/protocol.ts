// NoCPU browser adapter, GPL-3.0-or-later. Circuit behavior comes from DICE.
import type { GameOptions, PlayableGameId } from './game-contract';
export type CoreCommand =
  | { type: 'init'; moduleUrl: string; seed: number; gameId: PlayableGameId; options: GameOptions }
  | { type: 'clock'; running: boolean; epoch: number }
  | { type: 'inputs'; axes: (number | null)[]; revision: number }
  | { type: 'keys'; directions: number[] }
  | { type: 'coin' }
  | { type: 'start'; player?: 1 | 2 }
  | { type: 'serve'; held: boolean }
  | { type: 'release' }
  | { type: 'frame'; epoch: number }
  | { type: 'ack'; epoch: number; sequence: number }
  | { type: 'reset'; id: number; seed: number; epoch: number; running: boolean; options: GameOptions }
  | { type: 'snapshot'; id: number }
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
  | { type: 'frame'; epoch: number; pixels: ArrayBuffer | null }
  | { type: 'reset'; id: number; epoch: number; snapshot: CoreSnapshot }
  | { type: 'snapshot'; id: number; snapshot: CoreSnapshot }
  | { type: 'error'; message: string };
