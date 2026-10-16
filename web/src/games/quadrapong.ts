// SPDX-License-Identifier: GPL-3.0-or-later
// Quadrapong (Atari, 1974): browser access to the original games/quadrapong.cpp.
import type { GameDefinition } from './types';

export const quadrapong = {
  id: 'quadrapong',
  coreId: 8,
  title: 'Quadrapong',
  // Set only once its original/native/Wasm comparison passes (docs/ACCEPTANCE.md).
  verified: false,
  playerCount: 4,
  // PADDLE1/2_VERTICAL_INPUT (left, right) and PADDLE3/4_HORIZONTAL_INPUT (top,
  // bottom). Measured on the original raster: a larger canonical axis moves the
  // side paddles down and the end paddles right.
  channels: [
    { label: 'Left paddle', kind: 'paddle', orientation: 'vertical', slot: 0, axisSign: 1, negative: 'p1Up', positive: 'p1Down', pad: 0, axis: 1 },
    { label: 'Right paddle', kind: 'paddle', orientation: 'vertical', slot: 1, axisSign: 1, negative: 'p2Up', positive: 'p2Down', pad: 1, axis: 1 },
    { label: 'Top paddle', kind: 'paddle', orientation: 'horizontal', slot: 2, axisSign: 1, negative: 'p3Left', positive: 'p3Right', pad: 2, axis: 0 },
    { label: 'Bottom paddle', kind: 'paddle', orientation: 'horizontal', slot: 3, axisSign: 1, negative: 'p4Left', positive: 'p4Right', pad: 3, axis: 0 },
  ],
  buttons: [],
  starts: 1,
  hasHit: true,
  hasAttract: true,
  // The original miss counters of the left, right, top and bottom players.
  scoreSlots: 4,
  // DSW1 coinage in bit 0.
  settings: [
    { kind: 'select', key: 'coinage', label: 'Coinage', testId: 'coinage', dipShift: 0,
      choices: [{ value: 1, label: '1 coin / 1 credit' }, { value: 2, label: '1 coin / 2 credits' }], defaultValue: 1 },
  ],
  labels: {
    p1Up: 'Left paddle up', p1Down: 'Left paddle down', p2Up: 'Right paddle up', p2Down: 'Right paddle down',
    p3Left: 'Top paddle left', p3Right: 'Top paddle right', p4Left: 'Bottom paddle left', p4Right: 'Bottom paddle right',
  },
  keys: {
    p1Up: ['KeyW'], p1Down: ['KeyS'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'],
    p3Left: ['KeyJ'], p3Right: ['KeyL'], p4Left: ['KeyV'], p4Right: ['KeyB'],
  },
  text: {
    info: 'Four players each guard one side of the court. One credit is a two-player game, two credits a four-player game.',
    rules: (options) => `${options.coinage === 2 ? 'Insert a coin, then press Start: one coin buys a four-player game with the current setting.' : 'Insert one coin for a two-player game (left against right, with walls at the top and bottom) or two coins for a four-player game, then press Start.'} Move your paddle along your side to keep the ball out of your goal. Every miss counts against you: in a four-player game a player who misses four times is out and their goal becomes a wall; in a two-player game each player has eight. The last player left wins.`,
    gamepad: 'Controllers 1 and 2 move the left and right paddles with their vertical axis; controllers 3 and 4 move the top and bottom paddles with their horizontal axis. A moved joystick sets the paddle position along its side; a centered joystick leaves the last position alone. Direction buttons move the paddle.',
    status: 'Insert a coin, then Start to play',
  },
} as const satisfies GameDefinition;
