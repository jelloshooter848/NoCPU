// SPDX-License-Identifier: GPL-3.0-or-later
// Hi-Way (Atari, 1975): browser access to the original games/highway.cpp.
import type { GameDefinition } from './types';

export const hiway = {
  id: 'hiway',
  coreId: 12,
  title: 'Hi-Way',
  // Original/native/Wasm comparison passed on 2026-10-18 (docs/ACCEPTANCE.md, 0.3.0 comparison run).
  verified: true,
  playerCount: 1,
  // STEERINGWHEEL is the original WHEEL1_INPUT quadrature wheel: held keys
  // turn it through DICE's keyboard wheel path; a gamepad axis or the mouse
  // sets its turning rate. A wheel turned right steers the car right.
  channels: [
    { label: 'Steering wheel', kind: 'wheel', orientation: 'horizontal', slot: 0, negative: 'p1Left', positive: 'p1Right', pad: 0, axis: 0 },
  ],
  // ACCELERATOR is BUTTONS1_INPUT button 1, held.
  buttons: [{ action: 'p1Gas', slot: 0, button: 1 }],
  // The coin starts the game; there is no Start switch.
  starts: 0,
  hasHit: false,
  hasAttract: false,
  // The score and the play-time counter.
  scoreSlots: 2,
  // SW_EXT_PLAY (bits 0-3), SW_K4L4 concurrent traffic (bit 4), SW_H6N4
  // opposing traffic (bit 5); E9POT play time 10..1010 kOhm.
  settings: [
    { kind: 'select', key: 'extendedPlay', label: 'Extended play score', testId: 'extended-play', dipShift: 0,
      choices: Array.from({ length: 16 }, (_, index) => ({ value: index * 10, label: index ? `${index * 10}` : 'None' })), defaultValue: 60 },
    { kind: 'select', key: 'concurrentTraffic', label: 'Concurrent traffic', testId: 'concurrent-traffic', dipShift: 4,
      choices: [{ value: 1, label: 'Regular' }, { value: 2, label: 'Double' }], defaultValue: 1 },
    { kind: 'select', key: 'opposingTraffic', label: 'Opposing traffic', testId: 'opposing-traffic', dipShift: 5,
      choices: [{ value: 1, label: 'Regular' }, { value: 2, label: 'Double' }], defaultValue: 1 },
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 10000, maxOhms: 1010000, defaultOhms: 510000 },
  ],
  labels: { p1Left: 'Steer left', p1Right: 'Steer right', p1Gas: 'Accelerator', coin: 'Insert coin and start' },
  keys: { p1Left: ['ArrowLeft', 'KeyA'], p1Right: ['ArrowRight', 'KeyD'], p1Gas: ['ArrowUp', 'KeyW'] },
  // Controller 1: the left stick's horizontal axis steers (automatic), A or
  // the right trigger accelerates, X inserts a coin, Start opens the menu.
  gamepadButtons: {
    p1Gas: [{ pad: 0, button: 0 }, { pad: 0, button: 7 }],
    coin: [{ pad: 0, button: 2 }],
  },
  mouse: { kind: 'wheel', label: 'Steering wheel and accelerator', left: 'p1Gas',
    help: 'Move the mouse left or right of the display’s centre to turn the steering wheel that way, further out for a faster turn; hold the left mouse button over the display to accelerate.' },
  text: {
    info: 'Drive down a winding highway against the clock, past cars going your way and oncoming traffic.',
    rules: (options) => `Insert a coin to start; there is no Start button. Hold the accelerator to drive and steer with the wheel to stay on the road: driving off the road or into another car slows you down. The score counts the distance you drive. The game is timed${options.extendedPlay ? `; reaching ${options.extendedPlay} points earns extended play` : ''}. DICE has no sound for this game.`,
    gamepad: 'Controller 1: the left stick (horizontal) turns the steering wheel, A or the right trigger accelerates, X inserts a coin and Start opens the menu. The d-pad left and right also steer.',
    status: 'Insert a coin to start',
    coin: 'Insert coin',
  },
} as const satisfies GameDefinition;
