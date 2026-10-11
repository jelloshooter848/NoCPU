// SPDX-License-Identifier: GPL-3.0-or-later
// Browser access contract for the unchanged DICE circuits in this build.
export type PlayableGameId = 'pong' | 'pongdoubles' | 'spacerace' | 'breakout';
export interface PaddleGameOptions { winningScore: 11 | 15 }
export interface SpaceRaceOptions { coinage: 1 | 2; playtimeOhms: number }
export type BonusCredit = 0 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800;
export interface BreakoutOptions { bonusCredit: BonusCredit; cabinet: 'normal' | 'cocktail'; coinage: 1 | 2; balls: 3 | 5 }
export interface GameOptionsById {
  pong: PaddleGameOptions;
  pongdoubles: PaddleGameOptions;
  spacerace: SpaceRaceOptions;
  breakout: BreakoutOptions;
}
export type GameOptions = GameOptionsById[PlayableGameId];
export type GameSession = { [Id in PlayableGameId]: { gameId: Id; options: GameOptionsById[Id] } }[PlayableGameId];
export type GameInputKind = 'paddle' | 'joystick';

export const PLAYTIME_MIN_OHMS = 470000;
export const PLAYTIME_MAX_OHMS = 1470000;
export const PLAYTIME_DEFAULT_OHMS = 970000;
export const BONUS_CREDIT_OPTIONS: readonly BonusCredit[] = [0, 100, 200, 300, 400, 500, 600, 700, 800];

export interface GameSpec {
  title: string;
  coreId: number;
  inputKind: GameInputKind;
  playerCount: 2 | 4;
  controlSlotCount: 1 | 2 | 4;
  paddleCount: 0 | 1 | 2 | 4;
  paddleOrientation: 'vertical' | 'horizontal';
  // Display direction measured against the original cropped viewport. Native
  // axes retain the original signed range and resistance conversion.
  paddleAxisSign: 1 | -1 | null;
  hasStart: boolean;
  startButtons: 0 | 1 | 2;
  hasServe: boolean;
  controlLabels: readonly string[];
}
const GAME_SPECS: Record<PlayableGameId, GameSpec> = {
  pong: { title: 'Pong', coreId: 0, inputKind: 'paddle', playerCount: 2, controlSlotCount: 2, paddleCount: 2,
    paddleOrientation: 'vertical', paddleAxisSign: 1, hasStart: false, startButtons: 0, hasServe: false,
    controlLabels: ['Left paddle', 'Right paddle'] },
  pongdoubles: { title: 'Pong Doubles', coreId: 1, inputKind: 'paddle', playerCount: 4, controlSlotCount: 4, paddleCount: 4,
    paddleOrientation: 'vertical', paddleAxisSign: 1, hasStart: true, startButtons: 1, hasServe: false,
    controlLabels: ['Outer left paddle', 'Outer right paddle', 'Inner left paddle', 'Inner right paddle'] },
  spacerace: { title: 'Space Race', coreId: 2, inputKind: 'joystick', playerCount: 2, controlSlotCount: 2, paddleCount: 0,
    paddleOrientation: 'vertical', paddleAxisSign: 1, hasStart: true, startButtons: 1, hasServe: false,
    controlLabels: ['Left rocket', 'Right rocket'] },
  breakout: { title: 'Breakout', coreId: 3, inputKind: 'paddle', playerCount: 2, controlSlotCount: 1, paddleCount: 1,
    paddleOrientation: 'horizontal', paddleAxisSign: 1, hasStart: true, startButtons: 2, hasServe: true,
    controlLabels: ['Shared paddle'] },
};

export function isPlayableGameId(value: unknown): value is PlayableGameId {
  return value === 'pong' || value === 'pongdoubles' || value === 'spacerace' || value === 'breakout';
}
export function gameSpec(gameId: PlayableGameId): GameSpec { return GAME_SPECS[gameId]; }
export function defaultGameOptions<Id extends PlayableGameId>(gameId: Id): GameOptionsById[Id] {
  return (gameId === 'breakout' ? { bonusCredit: 300, cabinet: 'normal', coinage: 1, balls: 3 }
    : gameId === 'spacerace' ? { coinage: 1, playtimeOhms: PLAYTIME_DEFAULT_OHMS }
    : { winningScore: 11 }) as GameOptionsById[Id];
}
export function isGameOptions<Id extends PlayableGameId>(gameId: Id, value: unknown): value is GameOptionsById[Id] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const options = value as Record<string, unknown>;
  if (gameId === 'breakout') return BONUS_CREDIT_OPTIONS.includes(options.bonusCredit as BonusCredit)
    && (options.cabinet === 'normal' || options.cabinet === 'cocktail')
    && (options.coinage === 1 || options.coinage === 2) && (options.balls === 3 || options.balls === 5);
  if (gameId === 'spacerace') return (options.coinage === 1 || options.coinage === 2)
    && typeof options.playtimeOhms === 'number' && Number.isInteger(options.playtimeOhms)
    && options.playtimeOhms >= PLAYTIME_MIN_OHMS && options.playtimeOhms <= PLAYTIME_MAX_OHMS;
  return options.winningScore === 11 || options.winningScore === 15;
}
// Stored preferences can contain stale or malformed records. Restore each
// unsupported field to its original default; live worker launches validate.
export function normalizeGameOptions<Id extends PlayableGameId>(gameId: Id, value: unknown): GameOptionsById[Id] {
  const options = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return (gameId === 'breakout' ? {
    bonusCredit: BONUS_CREDIT_OPTIONS.includes(options.bonusCredit as BonusCredit) ? options.bonusCredit : 300,
    cabinet: options.cabinet === 'cocktail' ? 'cocktail' : 'normal',
    coinage: options.coinage === 2 ? 2 : 1,
    balls: options.balls === 5 ? 5 : 3,
  } : gameId === 'spacerace' ? {
    coinage: options.coinage === 2 ? 2 : 1,
    playtimeOhms: typeof options.playtimeOhms === 'number' && Number.isInteger(options.playtimeOhms)
      && options.playtimeOhms >= PLAYTIME_MIN_OHMS && options.playtimeOhms <= PLAYTIME_MAX_OHMS
      ? options.playtimeOhms : PLAYTIME_DEFAULT_OHMS,
  } : { winningScore: options.winningScore === 15 ? 15 : 11 }) as GameOptionsById[Id];
}
export function coreGameOptions(gameId: PlayableGameId, options: GameOptions): { game: number; dip: number; potOhms: number } {
  if (!isGameOptions(gameId, options)) throw new Error('Unsupported game settings.');
  if (gameId === 'breakout') {
    const selected = options as BreakoutOptions;
    return { game: GAME_SPECS[gameId].coreId, dip: selected.bonusCredit / 100
      | (selected.cabinet === 'cocktail' ? 16 : 0) | (selected.coinage === 2 ? 32 : 0)
      | (selected.balls === 5 ? 64 : 0), potOhms: 0 };
  }
  if (gameId === 'spacerace') {
    const selected = options as SpaceRaceOptions;
    return { game: GAME_SPECS[gameId].coreId, dip: selected.coinage - 1, potOhms: selected.playtimeOhms };
  }
  return { game: GAME_SPECS[gameId].coreId, dip: (options as PaddleGameOptions).winningScore === 15 ? 1 : 0, potOhms: 0 };
}

// The signed range is asymmetric. Reversing -32768..32767 requires -axis-1,
// which preserves both endpoints and is its own inverse; multiplication alone
// would produce32768 at one end. Relative direction uses only the sign.
export function canonicalPaddleAxis(gameId: PlayableGameId, displayAxis: number): number {
  const sign = gameSpec(gameId).paddleAxisSign;
  if (sign === null) throw new Error('This game is awaiting original paddle calibration.');
  const bounded = Math.round(Math.max(-32768, Math.min(32767, displayAxis)));
  return sign === -1 ? -bounded - 1 : bounded;
}
export const displayPaddleAxis = canonicalPaddleAxis;
