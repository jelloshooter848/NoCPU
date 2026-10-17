// SPDX-License-Identifier: GPL-3.0-or-later
// Gotcha (Atari, 1973): browser access to the original games/gotcha.cpp.
import type { GameDefinition } from './types';

/** Game length: the K8/L8 play-time counter ends the game as it passes 99. It
 * counts the D8 555 astable (R the play-time potentiometer, C 5 uF): a first
 * high phase of ln 3 x (R + 2 kOhm) x C from Start, then 99 periods of
 * ln 2 x (R + 4 kOhm) x C. */
const seconds = (ohms: number) => Math.round((Math.log(3) * (ohms + 2000) + 99 * Math.LN2 * (ohms + 4000)) * 5e-6);

export const gotcha = {
  id: 'gotcha',
  coreId: 7,
  title: 'Gotcha',
  verified: false,
  playerCount: 2,
  // JOYSTICK1_INPUT ("Move Cross") and JOYSTICK2_INPUT ("Move Square"): two
  // four-way sticks, each two channels on one slot (up/down, left/right).
  channels: [
    { label: 'Cross up and down', kind: 'stick', orientation: 'vertical', slot: 0, negative: 'p1Up', positive: 'p1Down', pad: 0, axis: 1 },
    { label: 'Cross left and right', kind: 'stick', orientation: 'horizontal', slot: 0, negative: 'p1Left', positive: 'p1Right', pad: 0, axis: 0 },
    { label: 'Square up and down', kind: 'stick', orientation: 'vertical', slot: 1, negative: 'p2Up', positive: 'p2Down', pad: 1, axis: 1 },
    { label: 'Square left and right', kind: 'stick', orientation: 'horizontal', slot: 1, negative: 'p2Left', positive: 'p2Right', pad: 1, axis: 0 },
  ],
  buttons: [],
  starts: 1,
  // HIT is the catch one-shot (CATCHOS).
  hasHit: true,
  hasAttract: true,
  // The two displayed numbers: catches (G8/J8) and elapsed play time (K8/L8).
  scoreSlots: 2,
  // POT1 "playtime", 47..297 kOhm on the D8 play-timer astable; the original
  // default is the maximum, 297 kOhm.
  settings: [
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 47000, maxOhms: 297000, defaultOhms: 297000 },
  ],
  labels: {
    p1Up: 'Cross up', p1Down: 'Cross down', p1Left: 'Cross left', p1Right: 'Cross right',
    p2Up: 'Square up', p2Down: 'Square down', p2Left: 'Square left', p2Right: 'Square right',
  },
  keys: {
    p1Up: ['KeyW'], p1Down: ['KeyS'], p1Left: ['KeyA'], p1Right: ['KeyD'],
    p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], p2Left: ['ArrowLeft'], p2Right: ['ArrowRight'],
  },
  text: {
    info: 'Two players chase each other through a maze that keeps changing shape: one steers the cross, the other the square.',
    rules: (options) => `Insert a coin, then press Start. Steer the cross or the square through the maze; walls stop you. When the two meet it is a catch: the screen flashes, the catch counter on the left goes up by one and the chase goes on. A beeping tone speeds up as the two players get closer. The clock on the right counts up, and the game ends when it passes 99: with the current play-time setting (${Math.round(((options.playtimeOhms ?? 297000) - 47000) / 2500)}%) after about ${seconds(options.playtimeOhms ?? 297000)} seconds.`,
    gamepad: 'Controller 1 moves the cross and controller 2 the square: the joystick pushed in a direction holds that direction (up/down on its vertical axis, left/right on its horizontal axis), and the direction buttons do the same.',
    status: 'Insert a coin, then Start to play',
  },
} as const satisfies GameDefinition;
