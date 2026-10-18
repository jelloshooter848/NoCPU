// SPDX-License-Identifier: GPL-3.0-or-later
// Browser access contract for the unchanged DICE circuits in this build.
import { REGISTERED_GAMES } from './games';
import type { ChannelDefinition, GameDefinition, RegisteredOptions } from './games/types';
export type { RegisteredOptions } from './games/types';
/** The six circuits ported before 0.2.0 keep their own access code below. */
export type LegacyGameId = 'pong' | 'pongdoubles' | 'spacerace' | 'breakout' | 'stuntcycle' | 'indy4';
/** Games ported from 0.2.0 on: web/src/games/<id>.ts (docs/PORT_GAME.md). */
export type RegisteredGameId = typeof REGISTERED_GAMES[number]['id'];
export type PlayableGameId = LegacyGameId | RegisteredGameId;
export const LEGACY_GAME_IDS: readonly LegacyGameId[] = ['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4'];
export const REGISTERED_GAME_IDS: readonly RegisteredGameId[] = (REGISTERED_GAMES as readonly GameDefinition[]).map((game) => game.id as RegisteredGameId);
export const PLAYABLE_GAME_IDS: readonly PlayableGameId[] = [...LEGACY_GAME_IDS, ...REGISTERED_GAME_IDS];
export function registeredGame(gameId: string): GameDefinition | undefined {
  return (REGISTERED_GAMES as readonly GameDefinition[]).find((game) => game.id === gameId);
}
export function isRegisteredGameId(value: unknown): value is RegisteredGameId {
  return typeof value === 'string' && registeredGame(value) !== undefined;
}
export interface PaddleGameOptions { winningScore: 11 | 15 }
export interface SpaceRaceOptions { coinage: 1 | 2; playtimeOhms: number }
export type BonusCredit = 0 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800;
export interface BreakoutOptions { bonusCredit: BonusCredit; cabinet: 'normal' | 'cocktail'; coinage: 1 | 2; balls: 3 | 5 }
export interface StuntCycleOptions { misses: number; freeGameScore: number; coinage: 1 | 2; freeGame: boolean }
export interface Indy4Options { playtimeOhms: number }
export type GameOptionsById = { [Id in RegisteredGameId]: RegisteredOptions } & {
  stuntcycle: StuntCycleOptions;
  indy4: Indy4Options;
  pong: PaddleGameOptions;
  pongdoubles: PaddleGameOptions;
  spacerace: SpaceRaceOptions;
  breakout: BreakoutOptions;
};
export type GameOptions = GameOptionsById[PlayableGameId];
export type GameSession = { [Id in PlayableGameId]: { gameId: Id; options: GameOptionsById[Id] } }[PlayableGameId];
export type GameInputKind = 'paddle' | 'joystick' | 'throttle' | 'wheel';

export const PLAYTIME_MIN_OHMS = 470000;
export const PLAYTIME_MAX_OHMS = 1470000;
export const PLAYTIME_DEFAULT_OHMS = 970000;
export const BONUS_CREDIT_OPTIONS: readonly BonusCredit[] = [0, 100, 200, 300, 400, 500, 600, 700, 800];

export interface GameSpec {
  title: string;
  coreId: number;
  inputKind: GameInputKind;
  playerCount: 1 | 2 | 4;
  controlSlotCount: 0 | 1 | 2 | 4;
  axisCount: 0 | 1 | 2 | 4;
  paddleCount: 0 | 1 | 2 | 4;
  paddleOrientation: 'vertical' | 'horizontal';
  // Display direction measured against the original cropped viewport. Native
  // axes retain the original signed range and resistance conversion.
  paddleAxisSign: 1 | -1 | null;
  hasStart: boolean;
  startButtons: 0 | 1 | 2;
  hasServe: boolean;
  controlLabels: readonly string[];
  /** Registered games: per-channel orientation and axis sign (paddle channels). */
  channels?: readonly ChannelDefinition[];
}
const GAME_SPECS: Record<LegacyGameId, GameSpec> = {
  stuntcycle: { title: 'Stunt Cycle', coreId: 4, inputKind: 'throttle', playerCount: 2, controlSlotCount: 1, axisCount: 1, paddleCount: 0, paddleOrientation: 'horizontal', paddleAxisSign: 1, hasStart: true, startButtons: 2, hasServe: false, controlLabels: ['Shared throttle'] },
  indy4: { title: 'Indy 4', coreId: 5, inputKind: 'wheel', playerCount: 4, controlSlotCount: 4, axisCount: 4, paddleCount: 0, paddleOrientation: 'horizontal', paddleAxisSign: 1, hasStart: false, startButtons: 0, hasServe: false, controlLabels: ['Green', 'Cyan', 'Violet', 'Red'] },
  pong: { title: 'Pong', coreId: 0, axisCount: 2, inputKind: 'paddle', playerCount: 2, controlSlotCount: 2, paddleCount: 2,
    paddleOrientation: 'vertical', paddleAxisSign: 1, hasStart: false, startButtons: 0, hasServe: false,
    controlLabels: ['Left paddle', 'Right paddle'] },
  pongdoubles: { title: 'Pong Doubles', coreId: 1, axisCount: 4, inputKind: 'paddle', playerCount: 4, controlSlotCount: 4, paddleCount: 4,
    paddleOrientation: 'vertical', paddleAxisSign: 1, hasStart: true, startButtons: 1, hasServe: false,
    controlLabels: ['Outer left paddle', 'Outer right paddle', 'Inner left paddle', 'Inner right paddle'] },
  spacerace: { title: 'Space Race', coreId: 2, axisCount: 0, inputKind: 'joystick', playerCount: 2, controlSlotCount: 2, paddleCount: 0,
    paddleOrientation: 'vertical', paddleAxisSign: 1, hasStart: true, startButtons: 1, hasServe: false,
    controlLabels: ['Left rocket', 'Right rocket'] },
  breakout: { title: 'Breakout', coreId: 3, axisCount: 1, inputKind: 'paddle', playerCount: 2, controlSlotCount: 1, paddleCount: 1,
    paddleOrientation: 'horizontal', paddleAxisSign: 1, hasStart: true, startButtons: 2, hasServe: true,
    controlLabels: ['Shared paddle'] },
};

function registeredSpec(game: GameDefinition): GameSpec {
  const paddles = game.channels.filter((channel) => channel.kind === 'paddle');
  const wheels = game.channels.filter((channel) => channel.kind === 'wheel');
  return { title: game.title, coreId: game.coreId, inputKind: paddles.length ? 'paddle' : wheels.length ? 'wheel' : 'joystick', playerCount: game.playerCount,
    controlSlotCount: game.channels.length as GameSpec['controlSlotCount'], axisCount: (paddles.length + wheels.length) as GameSpec['axisCount'],
    paddleCount: paddles.length as GameSpec['paddleCount'], paddleOrientation: game.channels[0]?.orientation ?? 'vertical',
    paddleAxisSign: paddles[0]?.axisSign ?? 1, hasStart: game.starts > 0, startButtons: game.starts, hasServe: false,
    controlLabels: game.channels.map((channel) => channel.label), channels: game.channels };
}
export function isPlayableGameId(value: unknown): value is PlayableGameId {
  return value === 'pong' || value === 'pongdoubles' || value === 'spacerace' || value === 'breakout' || value === 'stuntcycle' || value === 'indy4'
    || isRegisteredGameId(value);
}
export function gameSpec(gameId: PlayableGameId): GameSpec {
  const game = registeredGame(gameId);
  return game ? registeredSpec(game) : GAME_SPECS[gameId as LegacyGameId];
}
/** The registered game's original settings, by option key. */
function registeredDefaults(game: GameDefinition): RegisteredOptions {
  return Object.fromEntries(game.settings.map((setting) => [setting.key, setting.kind === 'select' ? setting.defaultValue : setting.defaultOhms]));
}
function validRegisteredSetting(setting: GameDefinition['settings'][number], value: unknown): boolean {
  return setting.kind === 'select' ? setting.choices.some((choice) => choice.value === value)
    : typeof value === 'number' && Number.isInteger(value) && value >= setting.minOhms && value <= setting.maxOhms;
}
export function defaultGameOptions<Id extends PlayableGameId>(gameId: Id): GameOptionsById[Id] {
  const game = registeredGame(gameId);
  if (game) return registeredDefaults(game) as unknown as GameOptionsById[Id];
  return (gameId === 'stuntcycle' ? { misses: 4, freeGameScore: 21, coinage: 1, freeGame: true }
    : gameId === 'indy4' ? { playtimeOhms: 720000 }
    : gameId === 'breakout' ? { bonusCredit: 300, cabinet: 'normal', coinage: 1, balls: 3 }
    : gameId === 'spacerace' ? { coinage: 1, playtimeOhms: PLAYTIME_DEFAULT_OHMS }
    : { winningScore: 11 }) as GameOptionsById[Id];
}
export function isGameOptions<Id extends PlayableGameId>(gameId: Id, value: unknown): value is GameOptionsById[Id] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const options = value as Record<string, unknown>;
  const game = registeredGame(gameId);
  if (game) return Object.keys(options).length === game.settings.length
    && game.settings.every((setting) => validRegisteredSetting(setting, options[setting.key]));
  if (gameId === 'stuntcycle') return Number.isInteger(options.misses) && Number(options.misses) >= 0 && Number(options.misses) <= 7
    && Number.isInteger(options.freeGameScore) && Number(options.freeGameScore) >= 12 && Number(options.freeGameScore) <= 27
    && (options.coinage === 1 || options.coinage === 2) && typeof options.freeGame === 'boolean';
  if (gameId === 'indy4') return Number.isInteger(options.playtimeOhms) && Number(options.playtimeOhms) >= 220000 && Number(options.playtimeOhms) <= 1220000;
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
  const game = registeredGame(gameId);
  if (game) return Object.fromEntries(game.settings.map((setting) => [setting.key, validRegisteredSetting(setting, options[setting.key])
    ? options[setting.key] : setting.kind === 'select' ? setting.defaultValue : setting.defaultOhms])) as unknown as GameOptionsById[Id];
  return (gameId === 'stuntcycle' ? {
    misses: Number.isInteger(options.misses) && Number(options.misses) >= 0 && Number(options.misses) <= 7 ? options.misses : 4,
    freeGameScore: Number.isInteger(options.freeGameScore) && Number(options.freeGameScore) >= 12 && Number(options.freeGameScore) <= 27 ? options.freeGameScore : 21,
    coinage: options.coinage === 2 ? 2 : 1, freeGame: typeof options.freeGame === 'boolean' ? options.freeGame : true,
  } : gameId === 'indy4' ? { playtimeOhms: Number.isInteger(options.playtimeOhms) && Number(options.playtimeOhms) >= 220000 && Number(options.playtimeOhms) <= 1220000 ? options.playtimeOhms : 720000 } : gameId === 'breakout' ? {
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
  const game = registeredGame(gameId);
  if (game) {
    // Packed original DIP indices in each switch's declared bit position, and
    // the potentiometer resistance in ohms (core/games/<id>.cpp).
    const selected = options as unknown as RegisteredOptions;
    let dip = 0, potOhms = 0;
    for (const setting of game.settings) {
      if (setting.kind === 'select') dip |= setting.choices.findIndex((choice) => choice.value === selected[setting.key]) << setting.dipShift;
      else potOhms = selected[setting.key];
    }
    return { game: game.coreId, dip, potOhms };
  }
  if (gameId === 'stuntcycle') {
    const selected = options as StuntCycleOptions;
    return { game: 4, dip: selected.misses | ((selected.freeGameScore - 12) << 3) | ((selected.coinage - 1) << 7) | (selected.freeGame ? 0 : 256), potOhms: 0 };
  }
  if (gameId === 'indy4') return { game: 5, dip: 0, potOhms: (options as Indy4Options).playtimeOhms };
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
  return { game: GAME_SPECS[gameId as LegacyGameId].coreId, dip: (options as PaddleGameOptions).winningScore === 15 ? 1 : 0, potOhms: 0 };
}

// The signed range is asymmetric. Reversing -32768..32767 requires -axis-1,
// which preserves both endpoints and is its own inverse; multiplication alone
// would produce32768 at one end. Relative direction uses only the sign.
export function canonicalPaddleAxis(gameId: PlayableGameId, displayAxis: number, slot = 0): number {
  const sign = paddleAxisSign(gameId, slot);
  if (sign === null) throw new Error('This game is awaiting original paddle calibration.');
  const bounded = Math.round(Math.max(-32768, Math.min(32767, displayAxis)));
  return sign === -1 ? -bounded - 1 : bounded;
}

/** Axis sign of one paddle slot (registered games may mix orientations). */
export function paddleAxisSign(gameId: PlayableGameId, slot: number): 1 | -1 | null {
  const spec = gameSpec(gameId);
  return spec.channels?.[slot]?.axisSign ?? spec.paddleAxisSign;
}
/** Orientation of one paddle slot, for the mouse. */
export function paddleOrientation(gameId: PlayableGameId, slot: number): 'vertical' | 'horizontal' {
  const spec = gameSpec(gameId);
  return spec.channels?.[slot]?.orientation ?? spec.paddleOrientation;
}
