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

import { pinpong } from './pinpong';

import { hiway } from './hiway';

// Reserved: import { antiaircraft } from './antiaircraft';

// Reserved: import { sharkjaws } from './sharkjaws';

// Reserved: import { jetfighter } from './jetfighter';

// Reserved: import { attack } from './attack';

export const REGISTERED_GAMES = [
  rebound,

  gotcha,

  quadrapong,

  crossfire,

  tvbasketball,

  pinpong,

  hiway,

  // Reserved: antiaircraft,

  // Reserved: sharkjaws,

  // Reserved: jetfighter,

  // Reserved: attack,
] as const satisfies readonly GameDefinition[];
