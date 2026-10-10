// NoCPU browser adapter, GPL-3.0-or-later. Circuit behavior comes from DICE.
export type CoreCommand =
  | { type: 'init'; moduleUrl: string; seed: number }
  | { type: 'clock'; running: boolean; epoch: number }
  | { type: 'inputs'; axes: [number | null, number | null]; revision: number }
  | { type: 'keys'; directions: [number, number] }
  | { type: 'coin' }
  | { type: 'release' }
  | { type: 'frame'; epoch: number }
  | { type: 'ack'; epoch: number; sequence: number }
  | { type: 'reset'; id: number; seed: number; epoch: number; running: boolean }
  | { type: 'snapshot'; id: number }
  | { type: 'destroy' };

export interface CoreSnapshot {
  timeps: string;
  frame: number;
  hits: number;
  scores: [number, number];
  run: boolean;
  attract: boolean;
  axes: [number, number];
  coin: boolean;
  inputRevision: number;
  wasmMemoryCapacityBytes: number;
  audioOverruns: number;
  audioTransportDroppedSamples: number;
}

export type CoreEvent =
  | { type: 'ready'; width: number; height: number; sampleRate: number; snapshot: CoreSnapshot }
  | { type: 'output'; epoch: number; sequence: number; audio: ArrayBuffer; audioDiscontinuity: boolean; snapshot: CoreSnapshot; elapsed: number }
  | { type: 'frame'; epoch: number; pixels: ArrayBuffer | null }
  | { type: 'reset'; id: number; epoch: number; snapshot: CoreSnapshot }
  | { type: 'snapshot'; id: number; snapshot: CoreSnapshot }
  | { type: 'error'; message: string };
