// SPDX-License-Identifier: GPL-3.0-or-later
// Browser access contract of a game ported from NoCPU 0.2.0 on. One file per
// game (web/src/games/<id>.ts) fills this in and web/src/games/index.ts lists
// it; the shared modules (game contract, controls, worker, settings, help)
// read it instead of carrying per-game branches. Nothing here is game logic:
// it names the original cabinet's controls and settings and how the
// keyboard, mouse and gamepad reach them. See docs/PORT_GAME.md.
import type { ActionId } from '../control-schema';

/** One logical control the player moves along a line: an absolute paddle
 * (original analog axis), one axis of a digital joystick, or an original
 * quadrature steering wheel (WHEELn_INPUT: a signed turning-rate axis from a
 * gamepad or the mouse, or the held left/right keys). Channels are the entries
 * of the browser's `directions` array, in order. Paddle and wheel channels
 * come first; their index is the core paddle or wheel slot. */
export interface ChannelDefinition {
  label: string;
  kind: 'paddle' | 'stick' | 'wheel';
  orientation: 'vertical' | 'horizontal';
  /** Core paddle slot (paddle), joystick slot (stick) or wheel slot (wheel). */
  slot: number;
  /** Measured against the original raster: +1 when a larger canonical axis
   * moves the paddle down (vertical) or right (horizontal), -1 otherwise. */
  axisSign?: 1 | -1;
  /** Keyboard/gamepad-button actions for up/left (negative) and down/right (positive). */
  negative: ActionId;
  positive: ActionId;
  /** Default gamepad and axis index for this channel. */
  pad: number;
  axis: number;
}

/** One held original BUTTONSn_INPUT switch. */
export interface ButtonDefinition { action: ActionId; slot: number; button: 1 | 2 | 3 }

/** One original DIP switch or potentiometer, as the Settings panel shows it. */
export type SettingDefinition =
  | { kind: 'select'; key: string; label: string; testId: string; dipShift: number;
    choices: readonly { value: number; label: string }[]; defaultValue: number }
  | { kind: 'percent'; key: string; label: string; testId: 'playtime' | 'tone';
    minOhms: number; maxOhms: number; defaultOhms: number;
    /** Explanation under the slider; the default reads "A higher setting allows more time…". */
    note?: string };

export type RegisteredOptions = Readonly<Record<string, number>>;

export interface GameDefinition {
  id: string;
  coreId: number;
  title: string;
  /** True only once the game's original/native/Wasm comparison passes (docs/ACCEPTANCE.md). */
  verified: boolean;
  playerCount: 1 | 2 | 4;
  channels: readonly ChannelDefinition[];
  buttons: readonly ButtonDefinition[];
  /** Number of original Start switches (0 when Coin starts the game). */
  starts: 0 | 1 | 2;
  /** The circuit counts HIT contacts (snapshot `hits`). */
  hasHit: boolean;
  /** The circuit has an ATTRACT_n observation (snapshot `attract`). */
  hasAttract: boolean;
  /** Number of score displays the core observes. */
  scoreSlots: 2 | 4;
  settings: readonly SettingDefinition[];
  /** Action labels for controls help and Settings, by action. */
  labels: Readonly<Partial<Record<ActionId, string>>>;
  /** Default keys, by action; coin/menu/reset/mute/start keep the shared defaults. */
  keys: Readonly<Partial<Record<ActionId, readonly string[]>>>;
  /** A mouse mapping other than a paddle channel. 'buttons': the left and
   * right mouse buttons over the display hold two of the game's held buttons.
   * 'wheel': the horizontal mouse position over the display sets the turning
   * rate of wheel channel 0 (centre straight, edges full turn), and the left
   * button holds `left`. The mouse setting offers this one assignment (or off). */
  mouse?: { kind: 'buttons' | 'wheel'; label: string; left?: ActionId; right?: ActionId; help: string };
  /** Extra default gamepad buttons, by action (channels and coin/menu/start are automatic). */
  gamepadButtons?: Readonly<Partial<Record<ActionId, readonly { pad: number; button: number }[]>>>;
  text: {
    /** Play screen / game info summary. */
    info: string;
    /** "How to play" rules for the current options. */
    rules: (options: RegisteredOptions) => string;
    /** Gamepad paragraph of "How to play". */
    gamepad: string;
    /** Status line while waiting for a game to start. */
    status: string;
    /** HUD coin button text, default 'Insert coin'. */
    coin?: string;
  };
}
