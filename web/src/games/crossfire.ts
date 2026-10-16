// SPDX-License-Identifier: GPL-3.0-or-later
// Crossfire (Atari, 1975): browser access to the original games/crossfire.cpp.
import type { GameDefinition } from './types';

export const crossfire = {
  id: 'crossfire',
  coreId: 9,
  title: 'Crossfire',
  // Set true only once the original/native/Wasm comparison passes (docs/ACCEPTANCE.md).
  verified: false,
  playerCount: 2,
  // JOYSTICK1/2_INPUT, Up and Down only: the original wires joystick 1 to the
  // left gun and joystick 2 to the right gun. Held Up moves a gun up the screen.
  channels: [
    { label: 'Left gun', kind: 'stick', orientation: 'vertical', slot: 0, negative: 'p1Up', positive: 'p1Down', pad: 0, axis: 1 },
    { label: 'Right gun', kind: 'stick', orientation: 'vertical', slot: 1, negative: 'p2Up', positive: 'p2Down', pad: 1, axis: 1 },
  ],
  // BUTTONS1/2_INPUT button 1: Fire for the left and right gun.
  buttons: [{ action: 'p1Fire', slot: 0, button: 1 }, { action: 'p2Fire', slot: 1, button: 1 }],
  // The coin starts the game; there is no Start switch.
  starts: 0,
  hasHit: true,
  hasAttract: true,
  // The original L3/J3 (left) and K3/J3 (right) score counters.
  scoreSlots: 2,
  // POT1 "playtime", 680..1680 kOhm (default 1180 kOhm) on the N9 game timer.
  settings: [
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 680000, maxOhms: 1680000, defaultOhms: 1180000 },
  ],
  labels: {
    p1Up: 'Left gun up', p1Down: 'Left gun down', p1Fire: 'Left gun fire',
    p2Up: 'Right gun up', p2Down: 'Right gun down', p2Fire: 'Right gun fire',
  },
  keys: {
    p1Up: ['KeyW'], p1Down: ['KeyS'], p1Fire: ['KeyD'],
    p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], p2Fire: ['ArrowLeft'],
  },
  gamepadButtons: { p1Fire: [{ pad: 0, button: 1 }], p2Fire: [{ pad: 1, button: 1 }] },
  text: {
    info: 'Two players move guns up and down the sides of the court and shoot the ball into the other player’s goal before time runs out.',
    rules: (options) => `Insert a coin: the game starts at once. Move your gun up or down and press Fire to shoot across the court. A bullet that hits the ball pushes it away from you; when the ball reaches the far goal you score a point. Each press fires one bullet, and a new bullet can be fired only after the last one has ended, so holding Fire does not repeat. The game runs on a timer: with the current play-time setting (${Math.round(((options.playtimeOhms ?? 1180000) - 680000) / 10000)}%) it lasts about ${Math.round(1.0986 * (options.playtimeOhms ?? 1180000) * 100e-6)} seconds, and the scores flash when it is nearly over. The higher score wins.`,
    gamepad: 'Controller 1 moves the left gun and controller 2 the right gun: a joystick pushed up or down holds that direction, and the direction buttons do the same. Button 2 fires.',
    status: 'Insert a coin to play',
  },
} as const satisfies GameDefinition;
