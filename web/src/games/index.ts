// SPDX-License-Identifier: GPL-3.0-or-later
// Games ported from NoCPU 0.2.0 on, one definition file each (docs/PORT_GAME.md).
// Each game owns its own reserved import line and list entry below, so ports
// developed in parallel do not edit the same lines.
import type { GameDefinition } from './types';
import { rebound } from './rebound';

import { gotcha } from './gotcha';

import { quadrapong } from './quadrapong';

import { crossfire } from './crossfire';

import { tvbasketball } from './tvbasketball';

// Pin Pong (web/src/games/pinpong.ts) is ported and its comparison passes, but
// it is held for 0.4.0 because it runs below real time (owner decision
// 2026-10-18): it stays off this list, so Play shows it under Coming soon.
// Reserved: import { pinpong } from './pinpong';

import { hiway } from './hiway';

export const REGISTERED_GAMES = [
  rebound,

  gotcha,

  quadrapong,

  crossfire,

  tvbasketball,

  // Held for 0.4.0: pinpong,

  hiway,
] as const satisfies readonly GameDefinition[];
