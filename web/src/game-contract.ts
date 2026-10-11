// SPDX-License-Identifier: GPL-3.0-or-later
// Browser access contract for the unchanged DICE circuits in this build.
export type PlayableGameId = 'pong' | 'pongdoubles' | 'spacerace';
export interface PaddleGameOptions { winningScore: 11 | 15 }
export interface SpaceRaceOptions { coinage: 1 | 2; playtimeOhms: number }
export interface GameOptionsById {
  pong: PaddleGameOptions;
  pongdoubles: PaddleGameOptions;
  spacerace: SpaceRaceOptions;
}
export type GameOptions = GameOptionsById[PlayableGameId];
export type GameSession = { [Id in PlayableGameId]: { gameId: Id; options: GameOptionsById[Id] } }[PlayableGameId];
export type GameInputKind = 'paddle' | 'joystick';

export const PLAYTIME_MIN_OHMS = 470000;
export const PLAYTIME_MAX_OHMS = 1470000;
export const PLAYTIME_DEFAULT_OHMS = 970000;

export interface GameSpec {
  title: string;
  coreId: number;
  inputKind: GameInputKind;
  playerCount: 2 | 4;
  paddleCount: 0 | 2 | 4;
  hasStart: boolean;
  controlLabels: readonly string[];
}
const GAME_SPECS: Record<PlayableGameId, GameSpec> = {
  pong: { title: 'Pong', coreId: 0, inputKind: 'paddle', playerCount: 2, paddleCount: 2, hasStart: false,
    controlLabels: ['Left paddle', 'Right paddle'] },
  pongdoubles: { title: 'Pong Doubles', coreId: 1, inputKind: 'paddle', playerCount: 4, paddleCount: 4, hasStart: true,
    controlLabels: ['Outer left paddle', 'Outer right paddle', 'Inner left paddle', 'Inner right paddle'] },
  spacerace: { title: 'Space Race', coreId: 2, inputKind: 'joystick', playerCount: 2, paddleCount: 0, hasStart: true,
    controlLabels: ['Left rocket', 'Right rocket'] },
};

export function isPlayableGameId(value: unknown): value is PlayableGameId {
  return value === 'pong' || value === 'pongdoubles' || value === 'spacerace';
}
export function gameSpec(gameId: PlayableGameId): GameSpec { return GAME_SPECS[gameId]; }
export function defaultGameOptions<Id extends PlayableGameId>(gameId: Id): GameOptionsById[Id] {
  return (gameId === 'spacerace' ? { coinage: 1, playtimeOhms: PLAYTIME_DEFAULT_OHMS }
    : { winningScore: 11 }) as GameOptionsById[Id];
}
export function isGameOptions<Id extends PlayableGameId>(gameId: Id, value: unknown): value is GameOptionsById[Id] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const options = value as Record<string, unknown>;
  if (gameId === 'spacerace') return (options.coinage === 1 || options.coinage === 2)
    && typeof options.playtimeOhms === 'number' && Number.isInteger(options.playtimeOhms)
    && options.playtimeOhms >= PLAYTIME_MIN_OHMS && options.playtimeOhms <= PLAYTIME_MAX_OHMS;
  return options.winningScore === 11 || options.winningScore === 15;
}
// Stored preferences can contain stale or malformed records. Restore each
// unsupported field to its original default; live worker launches validate.
export function normalizeGameOptions<Id extends PlayableGameId>(gameId: Id, value: unknown): GameOptionsById[Id] {
  const options = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return (gameId === 'spacerace' ? {
    coinage: options.coinage === 2 ? 2 : 1,
    playtimeOhms: typeof options.playtimeOhms === 'number' && Number.isInteger(options.playtimeOhms)
      && options.playtimeOhms >= PLAYTIME_MIN_OHMS && options.playtimeOhms <= PLAYTIME_MAX_OHMS
      ? options.playtimeOhms : PLAYTIME_DEFAULT_OHMS,
  } : { winningScore: options.winningScore === 15 ? 15 : 11 }) as GameOptionsById[Id];
}
export function coreGameOptions(gameId: PlayableGameId, options: GameOptions): { game: number; dip: number; potOhms: number } {
  if (!isGameOptions(gameId, options)) throw new Error('Unsupported game settings.');
  if (gameId === 'spacerace') {
    const selected = options as SpaceRaceOptions;
    return { game: GAME_SPECS[gameId].coreId, dip: selected.coinage - 1, potOhms: selected.playtimeOhms };
  }
  return { game: GAME_SPECS[gameId].coreId, dip: (options as PaddleGameOptions).winningScore === 15 ? 1 : 0, potOhms: 0 };
}
