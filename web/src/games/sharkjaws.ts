// SPDX-License-Identifier: GPL-3.0-or-later
// Shark Jaws (Atari, 1975): browser access to the original
// games/sharkjaws.cpp, with the player's own 1DA and 1DB PROMs.
import type { GameDefinition } from './types';

export const sharkjaws = {
  id: 'sharkjaws',
  coreId: 14,
  title: 'Shark Jaws',
  // Original/native/Wasm comparison passed on 2026-10-19 (docs/ACCEPTANCE.md, 0.5.0 Shark Jaws run).
  verified: true,
  playerCount: 1,
  // JOYSTICK1_INPUT ("Move Diver"): one four-way stick, two channels on slot 0.
  channels: [
    { label: 'Diver up and down', kind: 'stick', orientation: 'vertical', slot: 0, negative: 'p1Up', positive: 'p1Down', pad: 0, axis: 1 },
    { label: 'Diver left and right', kind: 'stick', orientation: 'horizontal', slot: 0, negative: 'p1Left', positive: 'p1Right', pad: 0, axis: 0 },
  ],
  buttons: [],
  starts: 1,
  hasHit: false,
  hasAttract: true,
  // The 6F/6E score (the second display slot is unused and stays 0).
  scoreSlots: 2,
  roms: ['004182.1da', '004183.1db'],
  // DSW1 coinage (bit 0); POT1 play time on N9A.
  settings: [
    { kind: 'select', key: 'coinage', label: 'Coinage', testId: 'coinage', dipShift: 0,
      choices: [{ value: 1, label: '1 coin / 1 credit' }, { value: 2, label: '1 coin / 2 credits' }], defaultValue: 1 },
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 470000, maxOhms: 1470000, defaultOhms: 970000 },
  ],
  labels: { p1Up: 'Diver up', p1Down: 'Diver down', p1Left: 'Diver left', p1Right: 'Diver right' },
  keys: { p1Up: ['ArrowUp', 'KeyW'], p1Down: ['ArrowDown', 'KeyS'], p1Left: ['ArrowLeft', 'KeyA'], p1Right: ['ArrowRight', 'KeyD'] },
  text: {
    info: 'A diver catches small fish while a shark hunts him under the sea. Needs your own ROM files.',
    rules: (options) => `${options.coinage === 2 ? 'Insert a coin for two games' : 'Insert a coin'}, then press Start. Steer the diver with the joystick to catch the small fish: each catch scores a point. Keep away from the shark: when it catches the diver, the diver disappears for a moment and then comes back. The game runs on a timer: with the current play-time setting (${Math.round(((options.playtimeOhms ?? 970000) - 470000) / 10000)}%) it lasts about ${Math.round(1.0986 * (options.playtimeOhms ?? 970000) * 100e-6)} seconds. DICE has no sound for this game.`,
    gamepad: 'Controller 1 moves the diver: the joystick pushed in a direction holds that direction, and the direction buttons do the same. A inserts a coin, B is Start and the Start button opens the menu.',
    status: 'Insert a coin, then Start to play',
  },
} as const satisfies GameDefinition;
