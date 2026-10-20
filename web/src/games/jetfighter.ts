// SPDX-License-Identifier: GPL-3.0-or-later
// Jet Fighter (Atari, 1975): browser access to the original
// games/jetfighter.cpp, with the player's own six PROMs.
import type { GameDefinition } from './types';

/** Seconds until the game ends: the K9 astable's eighth count after Start
 * (tools/reference/games/jetfighter.py), R the play-time potentiometer. */
const seconds = (ohms: number) => Math.round((1.0986 * (ohms + 470e3) + 0.6931 * 470e3 + 7 * 0.6931 * (ohms + 940e3)) * 10e-6);

export const jetfighter = {
  id: 'jetfighter',
  coreId: 15,
  title: 'Jet Fighter',
  verified: true,
  playerCount: 2,
  // JOYSTICK1_INPUT flies the white jet and JOYSTICK2_INPUT the black one:
  // Left/Right turn the jet, Up makes it faster and Down slower. Each stick
  // is two channels on one slot.
  channels: [
    { label: 'White jet speed', kind: 'stick', orientation: 'vertical', slot: 0, negative: 'p1Up', positive: 'p1Down', pad: 0, axis: 1 },
    { label: 'White jet turn', kind: 'stick', orientation: 'horizontal', slot: 0, negative: 'p1Left', positive: 'p1Right', pad: 0, axis: 0 },
    { label: 'Black jet speed', kind: 'stick', orientation: 'vertical', slot: 1, negative: 'p2Up', positive: 'p2Down', pad: 1, axis: 1 },
    { label: 'Black jet turn', kind: 'stick', orientation: 'horizontal', slot: 1, negative: 'p2Left', positive: 'p2Right', pad: 1, axis: 0 },
  ],
  // BUTTONS1/2_INPUT button 1: Fire.
  buttons: [{ action: 'p1Fire', slot: 0, button: 1 }, { action: 'p2Fire', slot: 1, button: 1 }],
  // Start 1-Player and Start 2-Player.
  starts: 2,
  hasHit: false,
  hasAttract: true,
  // The white jet's score (B5, shown on the right) and the black jet's (A6, left).
  scoreSlots: 2,
  roms: ['jet1.a4', 'jet1.j1', 'jet1.j5', 'jet1.k5', 'jet1.m1', 'jet1.r5'],
  // DSW1 coinage (bit 0); POT1 play time on the K9 astable.
  settings: [
    { kind: 'select', key: 'coinage', label: 'Coinage', testId: 'coinage', dipShift: 0,
      choices: [{ value: 1, label: 'One coin for two players' }, { value: 2, label: 'Two coins for two players' }], defaultValue: 1 },
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 10000, maxOhms: 1010000, defaultOhms: 510000 },
  ],
  labels: {
    p1Left: 'White jet turn left', p1Right: 'White jet turn right', p1Up: 'White jet faster', p1Down: 'White jet slower', p1Fire: 'White jet fire',
    p2Left: 'Black jet turn left', p2Right: 'Black jet turn right', p2Up: 'Black jet faster', p2Down: 'Black jet slower', p2Fire: 'Black jet fire',
    start: 'Start 1 player', start2: 'Start 2 players',
  },
  keys: {
    p1Left: ['KeyA'], p1Right: ['KeyD'], p1Up: ['KeyW'], p1Down: ['KeyS'], p1Fire: ['KeyF'],
    p2Left: ['ArrowLeft'], p2Right: ['ArrowRight'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], p2Fire: ['Slash'],
  },
  // Controller 1 flies the white jet and controller 2 the black one; Y or the
  // right shoulder button fires.
  gamepadButtons: { p1Fire: [{ pad: 0, button: 3 }, { pad: 0, button: 5 }], p2Fire: [{ pad: 1, button: 3 }, { pad: 1, button: 5 }] },
  text: {
    info: 'Two jets dogfight across the sky: shoot the other jet before time runs out, or fly against the machine. Needs your own ROM files.',
    rules: (options) => `Insert a coin, then press Start 1 to fly the white jet against the machine, which flies the black jet, or Start 2 for two players${options.coinage === 2 ? ' (with this coinage setting a two-player game takes two coins)' : ''}. Turn your jet left or right, speed it up or slow it down, and press Fire to shoot: a jet has one shell in the air at a time, and a hit scores a point for the shooter. The white jet's score is on the right, the black jet's on the left. The game runs on a timer: with the current play-time setting (${Math.round(((options.playtimeOhms ?? 510000) - 10000) / 10000)}%) it lasts about ${seconds(options.playtimeOhms ?? 510000)} seconds. DICE has no sound for this game.`,
    gamepad: 'Controller 1 flies the white jet and controller 2 the black one: the joystick or d-pad left and right turn, up speeds the jet up and down slows it; Y or the right shoulder button fires. A inserts a coin, B is Start 1, X is Start 2 and the Start button opens the menu.',
    status: 'Insert a coin, then Start 1 or Start 2',
  },
} as const satisfies GameDefinition;
