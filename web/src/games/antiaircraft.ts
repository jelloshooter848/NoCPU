// SPDX-License-Identifier: GPL-3.0-or-later
// Anti-Aircraft (Atari, 1975): browser access to the original
// games/antiaircraft.cpp, with the player's own K1 PROM (aa.k1).
import type { GameDefinition } from './types';

export const antiaircraft = {
  id: 'antiaircraft',
  coreId: 13,
  title: 'Anti-Aircraft',
  // Original/native/Wasm comparison passed on 2026-10-19 (docs/ACCEPTANCE.md, 0.5.0 Anti-Aircraft run).
  verified: true,
  playerCount: 2,
  // No analog control. Each launcher has three held buttons
  // (BUTTONS1_INPUT left, BUTTONS2_INPUT right). Through J9 each sets one of
  // three barrel angles and fires (measured on the original raster): left
  // buttons 1/2/3 aim high/middle/low, right buttons 1/2/3 aim low/middle/high.
  channels: [],
  buttons: [
    { action: 'p1Up', slot: 0, button: 1 }, { action: 'p1Fire', slot: 0, button: 2 }, { action: 'p1Down', slot: 0, button: 3 },
    { action: 'p2Down', slot: 1, button: 1 }, { action: 'p2Fire', slot: 1, button: 2 }, { action: 'p2Up', slot: 1, button: 3 },
  ],
  starts: 1,
  hasHit: false,
  hasAttract: true,
  // The left (C4/C5) and right (B4/B5) launchers' scores.
  scoreSlots: 2,
  roms: ['aa.k1'],
  // DSW1 coinage (bit 0), DSW2 plane type (bit 1); POT1 play time on D9.
  settings: [
    { kind: 'select', key: 'coinage', label: 'Coinage', testId: 'coinage', dipShift: 0,
      choices: [{ value: 1, label: '1 coin / 1 credit' }, { value: 2, label: '1 coin / 2 credits' }], defaultValue: 1 },
    { kind: 'select', key: 'planeType', label: 'Plane type', testId: 'plane-type', dipShift: 1,
      choices: [{ value: 0, label: 'Airplane' }, { value: 1, label: 'UFO' }], defaultValue: 0 },
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 220000, maxOhms: 1220000, defaultOhms: 830000 },
  ],
  labels: {
    p1Up: 'Left launcher: aim high and fire', p1Fire: 'Left launcher: aim middle and fire', p1Down: 'Left launcher: aim low and fire',
    p2Up: 'Right launcher: aim high and fire', p2Fire: 'Right launcher: aim middle and fire', p2Down: 'Right launcher: aim low and fire',
  },
  keys: { p1Up: ['KeyQ'], p1Fire: ['KeyA'], p1Down: ['KeyZ'], p2Up: ['KeyO'], p2Fire: ['KeyL'], p2Down: ['Period'] },
  // Controller 1 plays the left launcher and controller 2 the right one:
  // Y (3) high, X (2) middle, B (1) low; A (0) inserts a coin, Back (8) is
  // Start and Start (9) opens the menu.
  gamepadButtons: {
    p1Up: [{ pad: 0, button: 3 }], p1Fire: [{ pad: 0, button: 2 }], p1Down: [{ pad: 0, button: 1 }],
    p2Up: [{ pad: 1, button: 3 }], p2Fire: [{ pad: 1, button: 2 }], p2Down: [{ pad: 1, button: 1 }],
    coin: [{ pad: 0, button: 0 }, { pad: 1, button: 0 }], start: [{ pad: 0, button: 8 }, { pad: 1, button: 8 }],
    menu: [{ pad: 0, button: 9 }, { pad: 1, button: 9 }],
  },
  text: {
    info: 'Two players fire anti-aircraft missiles from launchers at the bottom of the screen at planes crossing the sky. Needs your own ROM file.',
    rules: (options) => `${options.coinage === 2 ? 'Insert a coin for two games' : 'Insert a coin'}, then press Start; both launchers play at once. Each launcher has three buttons: each one turns the launcher high, to the middle or low and fires a missile, and holding it keeps firing. Each plane hit scores a point for the launcher that hit it. The game runs on a timer: with the current play-time setting (${Math.round(((options.playtimeOhms ?? 830000) - 220000) / 10000)}%) it lasts about ${Math.round(1.0986 * (options.playtimeOhms ?? 830000) * 100e-6)} seconds. A coin inserted during a game ends it. The planes are ${options.planeType ? 'UFOs' : 'airplanes'} (Plane type setting). DICE has no sound for this game.`,
    gamepad: 'Controller 1 plays the left launcher and controller 2 the right one: Y aims high, X to the middle and B low, each firing; A inserts a coin, Back is Start and the Start button opens the menu.',
    status: 'Insert a coin, then Start to play',
  },
} as const satisfies GameDefinition;
