// SPDX-License-Identifier: GPL-3.0-or-later
// Rebound (Atari, 1974): browser access to the original games/rebound.cpp.
import type { GameDefinition } from './types';

export const rebound = {
  id: 'rebound',
  coreId: 6,
  title: 'Rebound',
  // Set only once its original/native/Wasm comparison passes (docs/ACCEPTANCE.md).
  verified: false,
  playerCount: 2,
  // PADDLE1/2_HORIZONTAL_INPUT. A larger canonical axis moves either paddle right.
  channels: [
    { label: 'Left paddle', kind: 'paddle', orientation: 'horizontal', slot: 0, axisSign: 1, negative: 'p1Left', positive: 'p1Right', pad: 0, axis: 0 },
    { label: 'Right paddle', kind: 'paddle', orientation: 'horizontal', slot: 1, axisSign: 1, negative: 'p2Left', positive: 'p2Right', pad: 1, axis: 0 },
  ],
  buttons: [],
  starts: 1,
  hasHit: true,
  hasAttract: true,
  scoreSlots: 2,
  // DSW1 winning score in bit 0, DSW2 coinage in bit 1.
  settings: [
    { kind: 'select', key: 'winningScore', label: 'Winning score', testId: 'winning-score', dipShift: 0,
      choices: [{ value: 11, label: '11' }, { value: 15, label: '15' }], defaultValue: 11 },
    { kind: 'select', key: 'coinage', label: 'Coinage', testId: 'coinage', dipShift: 1,
      choices: [{ value: 1, label: '1 coin / 1 credit' }, { value: 2, label: '1 coin / 2 credits' }], defaultValue: 1 },
  ],
  labels: { p1Left: 'Left paddle left', p1Right: 'Left paddle right', p2Left: 'Right paddle left', p2Right: 'Right paddle right' },
  keys: { p1Left: ['KeyA'], p1Right: ['KeyD'], p2Left: ['ArrowLeft'], p2Right: ['ArrowRight'] },
  text: {
    info: 'Insert a coin, then Start. Each player moves a paddle along the floor of their side and bounces the ball back over the net.',
    rules: (options) => `Insert a coin, then press Start. ${options.coinage === 2 ? 'One coin gives two credits with the current setting.' : 'Each coin gives one credit with the current setting.'} Move your paddle left or right along the floor of your side to bounce the ball back over the net. When the ball lands on your side, the other player scores. First to ${options.winningScore ?? 11} wins.`,
    gamepad: 'A moved joystick sets the paddle position across its side of the court. A centered joystick leaves the last position alone. Direction buttons move the paddle left or right.',
    status: 'Insert a coin, then Start to play',
  },
} as const satisfies GameDefinition;
