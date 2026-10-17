// SPDX-License-Identifier: GPL-3.0-or-later
// The games this build plays: the six earlier circuits and every game registered
// in web/src/games/index.ts (docs/PORT_GAME.md). Generic tests compare the UI
// against this list instead of naming the games one by one.
import { REGISTERED_GAMES } from '../../web/src/games';
import { auditedGames } from './rom-fixtures';

export const LEGACY_GAME_IDS = ['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4'] as const;
export const PORTED_GAME_IDS: readonly string[] = [...LEGACY_GAME_IDS, ...REGISTERED_GAMES.map((game) => game.id)];
/** The Play list order: ported games in audited (DICE) order. */
export const PLAY_ORDER: readonly string[] = auditedGames.filter((game) => PORTED_GAME_IDS.includes(game.id)).map((game) => game.id);
export const FIRST_PENDING = auditedGames.find((game) => !PORTED_GAME_IDS.includes(game.id))!;
