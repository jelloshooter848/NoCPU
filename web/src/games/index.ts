// SPDX-License-Identifier: GPL-3.0-or-later
// Games ported from NoCPU 0.2.0 on, one definition file each (docs/PORT_GAME.md).
// Each game owns its own reserved import line and list entry below, so ports
// developed in parallel do not edit the same lines.
import type { GameDefinition } from './types';
import { rebound } from './rebound';

import { gotcha } from './gotcha';

import { quadrapong } from './quadrapong';

import { crossfire } from './crossfire';

// Reserved: import { tvbasketball } from './tvbasketball';

// Reserved: import { pinpong } from './pinpong';

// Reserved: import { hiway } from './hiway';

export const REGISTERED_GAMES = [
  rebound,

  gotcha,

  quadrapong,

  crossfire,

  // Reserved: tvbasketball,

  // Reserved: pinpong,

  // Reserved: hiway,
] as const satisfies readonly GameDefinition[];
