// SPDX-License-Identifier: GPL-3.0-or-later
// Pin Pong (Atari, 1974): browser access to the original games/pinpong.cpp.
import type { GameDefinition } from './types';

export const pinpong = {
  id: 'pinpong',
  coreId: 11,
  title: 'Pin Pong',
  // Original/native/Wasm comparison passed on 2026-10-18 (docs/ACCEPTANCE.md, 0.3.0 comparison run).
  verified: true,
  playerCount: 1,
  // No analog control: the two flippers are the held FLIPPERS (BUTTONS1_INPUT)
  // switches 1 (left) and 2 (right).
  channels: [],
  buttons: [{ action: 'p1Fire', slot: 0, button: 1 }, { action: 'p2Fire', slot: 0, button: 2 }],
  // One Start switch: "Start Game / Serve Ball".
  starts: 1,
  hasHit: false,
  hasAttract: true,
  // The score (shown times ten) and the balls served.
  scoreSlots: 2,
  // S1 coinage (bit 0), S2 free ball (bit 1), S3 ball count (bit 2).
  settings: [
    { kind: 'select', key: 'coinage', label: 'Coinage', testId: 'coinage', dipShift: 0,
      choices: [{ value: 1, label: '1 coin / 1 credit' }, { value: 2, label: '1 coin / 2 credits' }], defaultValue: 1 },
    { kind: 'select', key: 'freeBall', label: 'Free ball', testId: 'free-ball', dipShift: 1,
      choices: [{ value: 1, label: 'Enabled' }, { value: 0, label: 'Disabled' }], defaultValue: 1 },
    { kind: 'select', key: 'balls', label: 'Balls per game', testId: 'balls', dipShift: 2,
      choices: [{ value: 3, label: '3' }, { value: 5, label: '5' }], defaultValue: 3 },
  ],
  labels: { p1Fire: 'Left flipper', p2Fire: 'Right flipper', start: 'Start game / serve ball' },
  keys: { p1Fire: ['KeyZ', 'ArrowLeft'], p2Fire: ['Slash', 'ArrowRight'] },
  // Controller 1: shoulder buttons and triggers (4/6 left, 5/7 right) and the
  // d-pad (14 left, 15 right) flip; A inserts a coin, B is Start, Start opens the menu.
  gamepadButtons: {
    p1Fire: [{ pad: 0, button: 4 }, { pad: 0, button: 6 }, { pad: 0, button: 14 }],
    p2Fire: [{ pad: 0, button: 5 }, { pad: 0, button: 7 }, { pad: 0, button: 15 }],
    coin: [{ pad: 0, button: 0 }], start: [{ pad: 0, button: 1 }], menu: [{ pad: 0, button: 9 }],
  },
  mouse: { kind: 'buttons', label: 'Flippers (left and right buttons)', left: 'p1Fire', right: 'p2Fire',
    help: 'Hold the left mouse button over the display to raise the left flipper and the right button to raise the right flipper.' },
  text: {
    info: 'A one-player pinball game on a video screen: keep the ball in play with two flippers and score off the bumpers and targets.',
    rules: (options) => `${options.coinage === 2 ? 'Insert a coin for two games' : 'Insert a coin'}, then press Start: the game begins and the first ball is served. When a ball drains past the flippers, press Start to serve the next one; the game ends when the last of the ${options.balls ?? 3} balls is lost. Hold a flipper to raise it and hit the ball back up the table. The bumpers and targets score; the score at the top counts in points.${options.freeBall === 0 ? ' The free ball is switched off.' : ''} DICE has no sound for this game.`,
    gamepad: 'Controller 1: the shoulder buttons, triggers or the d-pad left and right raise the left and right flippers; A inserts a coin, B is Start and the Start button opens the menu.',
    status: 'Insert a coin, then Start to play',
  },
} as const satisfies GameDefinition;
