// SPDX-License-Identifier: GPL-3.0-or-later
// Attack (Exidy, 1977): browser access to the original games/attack.cpp,
// with the player's own six PROMs (either accepted dump set).
import type { GameDefinition } from './types';

/** Seconds until the game ends: the E13 astable, ln 3 (R + 330 Ohm) 33 uF
 * (tools/reference/games/attack.py), R the play-time potentiometer. */
const seconds = (ohms: number) => Math.round(1.0986 * (ohms + 330) * 33e-6);

export const attack = {
  id: 'attack',
  coreId: 16,
  title: 'Attack',
  // Original/native/Wasm comparison passed on 2026-10-19 (docs/ACCEPTANCE.md, 0.5.0 Attack run).
  verified: true,
  playerCount: 2,
  // JOYSTICK1_INPUT is the ship: Left/Right move it, Up/Down turn its gun
  // (Up toward the left, Down toward the right). JOYSTICK2_INPUT Left/Right
  // rotate the plane counter-clockwise and clockwise.
  channels: [
    { label: 'Ship', kind: 'stick', orientation: 'horizontal', slot: 0, negative: 'p1Left', positive: 'p1Right', pad: 0, axis: 0 },
    { label: 'Ship gun', kind: 'stick', orientation: 'vertical', slot: 0, negative: 'p1Up', positive: 'p1Down', pad: 0, axis: 1 },
    { label: 'Plane', kind: 'stick', orientation: 'horizontal', slot: 1, negative: 'p2Left', positive: 'p2Right', pad: 1, axis: 0 },
  ],
  // BUTTONS1_INPUT button 1 fires the ship's gun; BUTTONS2_INPUT button 1
  // fires the plane's and its held button 2 makes the plane faster.
  buttons: [{ action: 'p1Fire', slot: 0, button: 1 }, { action: 'p2Fire', slot: 1, button: 1 }, { action: 'p2Gas', slot: 1, button: 2 }],
  // The coin starts the game; there is no Start switch.
  starts: 0,
  hasHit: false,
  hasAttract: false,
  // The ship's score (L11/M11, left) and the plane's (L12/M12, right).
  scoreSlots: 2,
  roms: ['attack.a1', 'attack.b1', 'attack.c1', 'attack.d1', 'attack.j6', 'attack.k6'],
  // No DIP switch; POT1 play time on the E13 astable.
  settings: [
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 1000000, maxOhms: 3000000, defaultOhms: 2500000 },
  ],
  labels: {
    p1Left: 'Ship left', p1Right: 'Ship right', p1Up: 'Ship gun turn left', p1Down: 'Ship gun turn right', p1Fire: 'Ship fire',
    p2Left: 'Plane turn counter-clockwise', p2Right: 'Plane turn clockwise', p2Fire: 'Plane fire', p2Gas: 'Plane faster',
    coin: 'Insert coin and start',
  },
  keys: {
    p1Left: ['KeyA'], p1Right: ['KeyD'], p1Up: ['KeyW'], p1Down: ['KeyS'], p1Fire: ['KeyF'],
    p2Left: ['ArrowLeft'], p2Right: ['ArrowRight'], p2Fire: ['Slash'], p2Gas: ['ArrowUp'],
  },
  // Controller 1 is the ship and controller 2 the plane; Y or the right
  // shoulder button fires, the plane's A or right trigger makes it faster, and
  // X inserts a coin.
  gamepadButtons: {
    p1Fire: [{ pad: 0, button: 3 }, { pad: 0, button: 5 }], p2Fire: [{ pad: 1, button: 3 }, { pad: 1, button: 5 }],
    p2Gas: [{ pad: 1, button: 0 }, { pad: 1, button: 7 }],
    coin: [{ pad: 0, button: 2 }, { pad: 1, button: 2 }],
  },
  text: {
    info: 'A ship below, a plane above: the ship shoots the plane down, the plane sinks the ship. Needs your own ROM files.',
    rules: (options) => `Insert a coin to start; there is no Start button. One player sails the ship along the bottom: move it left or right, turn its gun left or right and fire. The other flies the plane: turn it, hold Faster for speed, and fire on the ship. The ship scores a point each time the plane goes down, shot down or flown into the sea; the plane scores a point each time the ship sinks. The ship's score is on the left, the plane's on the right. The game runs on a timer: with the current play-time setting (${Math.round(((options.playtimeOhms ?? 2500000) - 1000000) / 20000)}%) it lasts about ${seconds(options.playtimeOhms ?? 2500000)} seconds. A coin during a game does not restart it.`,
    gamepad: 'Controller 1 is the ship: the joystick or d-pad left and right move it, up and down turn the gun left and right, Y or the right shoulder button fires. Controller 2 is the plane: left and right turn it, Y or the right shoulder button fires, A or the right trigger makes it faster. X inserts a coin and the Start button opens the menu.',
    status: 'Insert a coin to start',
    coin: 'Insert coin',
  },
} as const satisfies GameDefinition;
