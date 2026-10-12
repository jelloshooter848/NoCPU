import inventory from '../../tests/fixtures/game-manifest.json';
import { gameSpec, isPlayableGameId, type PlayableGameId } from './game-contract';

/** The shipped Pong actions stay stable for version-1 settings migration. */
export const ACTION_IDS = ['p1Up', 'p1Down', 'p2Up', 'p2Down', 'coin', 'menu', 'reset', 'mute'] as const;
export const ALL_ACTION_IDS = [...ACTION_IDS, 'p3Up', 'p3Down', 'p4Up', 'p4Down', 'start', 'p1Left', 'p1Right', 'start2', 'serve', 'p2Left', 'p2Right', 'p3Left', 'p3Right', 'p4Left', 'p4Right', 'p1Gas', 'p1Brake', 'p2Gas', 'p2Brake', 'p3Gas', 'p3Brake', 'p4Gas', 'p4Brake', 'coin1', 'coin2', 'coin3', 'coin4', 'coinDollar'] as const;
export type ActionId = typeof ALL_ACTION_IDS[number];
export type GameAction = 'coin' | 'coin1' | 'coin2' | 'coin3' | 'coin4' | 'coinDollar' | 'start' | 'start2' | 'menu' | 'reset' | 'mute';
export const ACTION_LABELS: Record<ActionId, string> = {
  p1Up: 'Player 1 up', p1Down: 'Player 1 down', p2Up: 'Player 2 up', p2Down: 'Player 2 down',
  p3Up: 'Player 3 up', p3Down: 'Player 3 down', p4Up: 'Player 4 up', p4Down: 'Player 4 down',
  coin: 'Insert coin', start: 'Start game', menu: 'Pause / resume', reset: 'Reset game', mute: 'Toggle sound',
  p1Left: 'Shared paddle left', p1Right: 'Shared paddle right', start2: 'Start 2 players', serve: 'Serve ball',
  p2Left: 'Cyan turn left', p2Right: 'Cyan turn right', p3Left: 'Violet turn left', p3Right: 'Violet turn right', p4Left: 'Red turn left', p4Right: 'Red turn right',
  p1Gas: 'Green gas pedal', p1Brake: 'Green hand brake', p2Gas: 'Cyan gas pedal', p2Brake: 'Cyan hand brake',
  p3Gas: 'Violet gas pedal', p3Brake: 'Violet hand brake', p4Gas: 'Red gas pedal', p4Brake: 'Red hand brake',
  coin1: 'Green coin', coin2: 'Cyan coin', coin3: 'Violet coin', coin4: 'Red coin', coinDollar: 'Dollar bill',
};
export function actionLabel(action: ActionId, gameId: PlayableGameId = 'pong'): string {
  if ((gameId === 'breakout' || gameId === 'stuntcycle') && action === 'start') return 'Start 1 player';
  if (gameId === 'stuntcycle' && action === 'p1Up') return 'Increase shared throttle';
  if (gameId === 'stuntcycle' && action === 'p1Down') return 'Decrease shared throttle';
  if (gameId === 'indy4' && action === 'p1Left') return 'Green turn left';
  if (gameId === 'indy4' && action === 'p1Right') return 'Green turn right';
  return ACTION_LABELS[action];
}
export type KeyboardBindings = Record<ActionId, string[]>;
export interface GamepadButtonBinding { pad: number; button: number }
export interface GamepadPlayerBinding { pad: number; axis: number; invert: boolean; deadzone: number }
export interface GamepadBindings { players: GamepadPlayerBinding[]; buttons: Record<ActionId, GamepadButtonBinding[]> }
export interface Bindings { keyboard: KeyboardBindings; gamepad: GamepadBindings }
export function actionsForGame(gameId: PlayableGameId = 'pong'): readonly ActionId[] {
  return gameId === 'indy4' ? ['p1Left', 'p1Right', 'p1Gas', 'p1Brake', 'p2Left', 'p2Right', 'p2Gas', 'p2Brake', 'p3Left', 'p3Right', 'p3Gas', 'p3Brake', 'p4Left', 'p4Right', 'p4Gas', 'p4Brake', 'coin1', 'coin2', 'coin3', 'coin4', 'coinDollar', 'menu', 'reset', 'mute']
    : gameId === 'stuntcycle' ? ['p1Up', 'p1Down', 'coin', 'start', 'start2', 'menu', 'reset', 'mute']
    : gameId === 'breakout' ? ['p1Left', 'p1Right', 'coin', 'start', 'start2', 'serve', 'menu', 'reset', 'mute']
    : gameId === 'pong' ? ACTION_IDS : gameId === 'pongdoubles'
    ? ['p1Up', 'p1Down', 'p2Up', 'p2Down', 'p3Up', 'p3Down', 'p4Up', 'p4Down', 'coin', 'start', 'menu', 'reset', 'mute']
    : ['p1Up', 'p1Down', 'p2Up', 'p2Down', 'coin', 'start', 'menu', 'reset', 'mute'];
}
export function controlPlayerCount(gameId: PlayableGameId = 'pong'): number { return gameSpec(gameId).controlSlotCount; }
export function directionAction(slot: number, direction: 'Up' | 'Down', gameId: PlayableGameId = 'pong'): ActionId {
  return gameId === 'breakout' || gameId === 'indy4' ? `p${slot + 1}${direction === 'Up' ? 'Left' : 'Right'}` as ActionId : `p${slot + 1}${direction}` as ActionId;
}
export function defaultBindings(gameId: PlayableGameId = 'pong'): Bindings {
  const keyboard = Object.fromEntries(ALL_ACTION_IDS.map((action) => [action, [] as string[]])) as KeyboardBindings;
  Object.assign(keyboard, { p1Up: ['KeyW'], p1Down: ['KeyS'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], coin: ['Enter'], menu: ['Space'], reset: ['KeyR'], mute: ['KeyM'] });
  if (gameId !== 'pong') keyboard.start = ['Digit1'];
  if (gameId === 'breakout') Object.assign(keyboard, { p1Left: ['ArrowLeft'], p1Right: ['ArrowRight'], start2: ['Digit2'], serve: ['KeyS'] });
  if (gameId === 'stuntcycle') keyboard.start2 = ['Digit2'];
  if (gameId === 'indy4') Object.assign(keyboard, { p1Left: ['KeyA'], p1Right: ['KeyD'], p1Gas: ['KeyW'], p1Brake: ['KeyS'], p2Left: ['ArrowLeft'], p2Right: ['ArrowRight'], p2Gas: ['ArrowUp'], p2Brake: ['ArrowDown'], p3Left: ['KeyJ'], p3Right: ['KeyL'], p3Gas: ['KeyI'], p3Brake: ['KeyK'], p4Left: ['Numpad4'], p4Right: ['Numpad6'], p4Gas: ['Numpad8'], p4Brake: ['Numpad5'], coin1: ['Digit1'], coin2: ['Digit2'], coin3: ['Digit3'], coin4: ['Digit4'], coinDollar: ['Digit5'] });
  if (gameId === 'pongdoubles') Object.assign(keyboard, { p3Up: ['KeyT'], p3Down: ['KeyG'], p4Up: ['KeyI'], p4Down: ['KeyK'] });
  const buttons = Object.fromEntries(ALL_ACTION_IDS.map((action) => [action, [] as GamepadButtonBinding[]])) as GamepadBindings['buttons'];
  const players = Array.from({ length: controlPlayerCount(gameId) }, (_, pad) => ({ pad, axis: gameId === 'breakout' || gameId === 'indy4' ? 0 : 1, invert: false, deadzone: 0.15 }));
  players.forEach((player, slot) => {
    buttons[directionAction(slot, 'Up', gameId)] = [{ pad: player.pad, button: gameId === 'breakout' || gameId === 'indy4' ? 14 : 12 }];
    buttons[directionAction(slot, 'Down', gameId)] = [{ pad: player.pad, button: gameId === 'breakout' || gameId === 'indy4' ? 15 : 13 }];
    buttons.coin.push({ pad: player.pad, button: 0 });
    buttons.menu.push({ pad: player.pad, button: 9 });
    if (gameId === 'indy4') {
      buttons[`p${slot + 1}Gas` as ActionId] = [{ pad: player.pad, button: 0 }];
      buttons[`p${slot + 1}Brake` as ActionId] = [{ pad: player.pad, button: 1 }];
      buttons[`coin${slot + 1}` as ActionId] = [{ pad: player.pad, button: 2 }];
    }
    if (gameId !== 'pong' && gameId !== 'indy4') buttons.start.push({ pad: player.pad, button: 1 });
    if (gameId === 'stuntcycle') buttons.start2.push({ pad: player.pad, button: 2 });
    if (gameId === 'breakout') { buttons.start2.push({ pad: player.pad, button: 2 }); buttons.serve.push({ pad: player.pad, button: 3 }); }
  });
  if (gameId === 'indy4') buttons.coinDollar = [{ pad: 0, button: 3 }];
  return { keyboard, gamepad: { players, buttons } };
}
export const DEFAULT_BINDINGS: Bindings = defaultBindings();
export function cloneBindings(value: Bindings = DEFAULT_BINDINGS): Bindings { return structuredClone(value); }
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const names: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  return names[code] ?? code.replace(/^Numpad/, 'Numpad ');
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function boundedInteger(value: unknown, max: number): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max; }
const ALLOWED_CODE = /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|F([1-9]|1[0-9]|2[0-4]))$/;
export type BindingValidation = { ok: true; bindings: Bindings } | { ok: false; errors: string[] };
/** Validate only the selected game's actions; old Pong maps acquire empty inactive fields. */
export function validateBindings(value: unknown, gameId: PlayableGameId = 'pong'): BindingValidation {
  const errors: string[] = [];
  if (!record(value) || !record(value.keyboard) || !record(value.gamepad)) return { ok: false, errors: ['The control mapping is incomplete.'] };
  const keyboard = value.keyboard;
  const gamepad = value.gamepad;
  const usedKeys = new Map<string, ActionId>();
  const usedButtons = new Map<string, ActionId>();
  const normalized = defaultBindings(gameId);
  for (const action of actionsForGame(gameId)) {
    const codes = keyboard[action];
    if (!Array.isArray(codes) || codes.length > 4 || codes.some((code) => typeof code !== 'string' || !ALLOWED_CODE.test(code))) {
      errors.push(`${ACTION_LABELS[action]} needs up to four supported keys. Escape and Tab are reserved for navigation.`); continue;
    }
    normalized.keyboard[action] = [...new Set(codes as string[])];
    for (const code of normalized.keyboard[action]) {
      const previous = usedKeys.get(code);
      if (previous && previous !== action) errors.push(`${keyLabel(code)} is already assigned to ${ACTION_LABELS[previous]}.`);
      usedKeys.set(code, action);
    }
  }
  if (!Array.isArray(gamepad.players) || gamepad.players.length !== controlPlayerCount(gameId)) errors.push('Choose an independent gamepad axis for each player.');
  else gamepad.players.forEach((player: unknown, slot: number) => {
    if (!record(player) || !boundedInteger(player.pad, 7) || !boundedInteger(player.axis, 15) || typeof player.invert !== 'boolean' || typeof player.deadzone !== 'number' || !Number.isFinite(player.deadzone) || player.deadzone < 0.05 || player.deadzone > 0.5) {
      errors.push(`Player ${slot + 1} needs a valid pad, axis and deadzone (5–50%).`);
    } else normalized.gamepad.players[slot] = { pad: player.pad, axis: player.axis, invert: player.invert, deadzone: player.deadzone };
  });
  const usedAxes = new Set<string>();
  for (const player of normalized.gamepad.players) {
    const key = `${player.pad}:${player.axis}`;
    if (usedAxes.has(key)) errors.push('Players need independent gamepad axes.');
    usedAxes.add(key);
  }
  if (!record(gamepad.buttons)) errors.push('The gamepad button mapping is incomplete.');
  else for (const action of actionsForGame(gameId)) {
    const buttons = gamepad.buttons[action];
    if (!Array.isArray(buttons) || buttons.length > 4 || buttons.some((button) => !record(button) || !boundedInteger(button.pad, 7) || !boundedInteger(button.button, 31))) {
      errors.push(`${ACTION_LABELS[action]} needs up to four valid gamepad buttons.`); continue;
    }
    const unique = new Map<string, GamepadButtonBinding>();
    for (const button of buttons as GamepadButtonBinding[]) {
      const key = `${button.pad}:${button.button}`;
      const previous = usedButtons.get(key);
      if (previous && previous !== action) errors.push(`Pad ${button.pad + 1}, button ${button.button} is already assigned to ${ACTION_LABELS[previous]}.`);
      usedButtons.set(key, action); unique.set(key, { pad: button.pad, button: button.button });
    }
    normalized.gamepad.buttons[action] = [...unique.values()];
  }
  return errors.length ? { ok: false, errors } : { ok: true, bindings: normalized };
}
export type ControlFamily = 'buttons' | 'coin' | 'joystick' | 'paddle' | 'start' | 'throttle' | 'wheel';
interface AuditedControlGame { id: string; max_players_indicated: number; controls: { kind: ControlFamily; slot: number | null; label: string; chip: string }[] }
export interface GameControlSchema {
  gameId: string; players: number; families: ControlFamily[];
  controls: { family: ControlFamily; player: number | null; label: string; sourceChip: string }[];
  runtime: PlayableGameId | 'not-implemented'; keyboardActions: ActionId[];
}
const auditedGames = inventory.games as unknown as readonly AuditedControlGame[];
export function getControlSchema(gameId: string): GameControlSchema | undefined {
  const game = auditedGames.find((entry) => entry.id === gameId);
  if (!game) return undefined;
  return { gameId, players: game.max_players_indicated, families: [...new Set(game.controls.map((control) => control.kind))],
    controls: game.controls.map((control) => ({ family: control.kind, player: control.slot, label: control.label, sourceChip: control.chip })),
    runtime: isPlayableGameId(gameId) ? gameId : 'not-implemented', keyboardActions: isPlayableGameId(gameId) ? [...actionsForGame(gameId)] : [] };
}
