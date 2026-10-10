import inventory from '../../tests/fixtures/game-manifest.json';

export const ACTION_IDS = ['p1Up', 'p1Down', 'p2Up', 'p2Down', 'coin', 'menu', 'reset', 'mute'] as const;
export type ActionId = typeof ACTION_IDS[number];
export const ACTION_LABELS: Record<ActionId, string> = {
  p1Up: 'Player 1 up', p1Down: 'Player 1 down', p2Up: 'Player 2 up', p2Down: 'Player 2 down',
  coin: 'Insert coin', menu: 'Pause / resume', reset: 'Reset game', mute: 'Toggle sound',
};
export type KeyboardBindings = Record<ActionId, string[]>;
export interface GamepadButtonBinding { pad: number; button: number }
export interface GamepadPlayerBinding { pad: number; axis: number; invert: boolean; deadzone: number }
export interface GamepadBindings {
  players: [GamepadPlayerBinding, GamepadPlayerBinding];
  buttons: Record<ActionId, GamepadButtonBinding[]>;
}
export interface Bindings { keyboard: KeyboardBindings; gamepad: GamepadBindings }

export const DEFAULT_BINDINGS: Bindings = {
  keyboard: { p1Up: ['KeyW'], p1Down: ['KeyS'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], coin: ['Enter'], menu: ['Space'], reset: ['KeyR'], mute: ['KeyM'] },
  gamepad: {
    players: [{ pad: 0, axis: 1, invert: false, deadzone: 0.15 }, { pad: 1, axis: 1, invert: false, deadzone: 0.15 }],
    buttons: {
      p1Up: [{ pad: 0, button: 12 }], p1Down: [{ pad: 0, button: 13 }],
      p2Up: [{ pad: 1, button: 12 }], p2Down: [{ pad: 1, button: 13 }],
      coin: [{ pad: 0, button: 0 }, { pad: 1, button: 0 }],
      menu: [{ pad: 0, button: 9 }, { pad: 1, button: 9 }], reset: [], mute: [],
    },
  },
};

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
/** Remaps are transactional: the caller replaces its working map only on success. */
export function validateBindings(value: unknown): BindingValidation {
  const errors: string[] = [];
  if (!record(value) || !record(value.keyboard) || !record(value.gamepad)) return { ok: false, errors: ['The control mapping is incomplete.'] };
  const keyboard = value.keyboard;
  const gamepad = value.gamepad;
  const usedKeys = new Map<string, ActionId>();
  const usedButtons = new Map<string, ActionId>();
  const normalized = cloneBindings();
  for (const action of ACTION_IDS) {
    const codes = keyboard[action];
    if (!Array.isArray(codes) || codes.length > 4 || codes.some((code) => typeof code !== 'string' || !ALLOWED_CODE.test(code))) {
      errors.push(`${ACTION_LABELS[action]} needs up to four supported keys. Escape and Tab are reserved for navigation.`);
      continue;
    }
    normalized.keyboard[action] = [...new Set(codes as string[])];
    for (const code of normalized.keyboard[action]) {
      const previous = usedKeys.get(code);
      if (previous && previous !== action) errors.push(`${keyLabel(code)} is already assigned to ${ACTION_LABELS[previous]}.`);
      usedKeys.set(code, action);
    }
  }
  if (!Array.isArray(gamepad.players) || gamepad.players.length !== 2) errors.push('Choose a gamepad axis for each player.');
  else gamepad.players.forEach((player: unknown, slot: number) => {
    if (!record(player) || !boundedInteger(player.pad, 7) || !boundedInteger(player.axis, 15) || typeof player.invert !== 'boolean' || typeof player.deadzone !== 'number' || !Number.isFinite(player.deadzone) || player.deadzone < 0.05 || player.deadzone > 0.5) {
      errors.push(`Player ${slot + 1} needs a valid pad, axis and deadzone (5–50%).`);
    } else normalized.gamepad.players[slot] = { pad: player.pad, axis: player.axis, invert: player.invert, deadzone: player.deadzone };
  });
  if (normalized.gamepad.players[0].pad === normalized.gamepad.players[1].pad && normalized.gamepad.players[0].axis === normalized.gamepad.players[1].axis) errors.push('Players need independent gamepad axes.');
  if (!record(gamepad.buttons)) errors.push('The gamepad button mapping is incomplete.');
  else for (const action of ACTION_IDS) {
    const buttons = gamepad.buttons[action];
    if (!Array.isArray(buttons) || buttons.length > 4 || buttons.some((button) => !record(button) || !boundedInteger(button.pad, 7) || !boundedInteger(button.button, 31))) {
      errors.push(`${ACTION_LABELS[action]} needs up to four valid gamepad buttons.`);
      continue;
    }
    const unique = new Map<string, GamepadButtonBinding>();
    for (const button of buttons as GamepadButtonBinding[]) {
      const key = `${button.pad}:${button.button}`;
      const previous = usedButtons.get(key);
      if (previous && previous !== action) errors.push(`Pad ${button.pad + 1}, button ${button.button} is already assigned to ${ACTION_LABELS[previous]}.`);
      usedButtons.set(key, action);
      unique.set(key, { pad: button.pad, button: button.button });
    }
    normalized.gamepad.buttons[action] = [...unique.values()];
  }
  return errors.length ? { ok: false, errors } : { ok: true, bindings: normalized };
}

export type ControlFamily = 'buttons' | 'coin' | 'joystick' | 'paddle' | 'start' | 'throttle' | 'wheel';
interface AuditedControlGame {
  id: string; max_players_indicated: number;
  controls: { kind: ControlFamily; slot: number | null; label: string; chip: string }[];
}
export interface GameControlSchema {
  gameId: string; players: number; families: ControlFamily[];
  controls: { family: ControlFamily; player: number | null; label: string; sourceChip: string }[];
  runtime: 'pong' | 'not-implemented'; keyboardActions: ActionId[];
}
const auditedGames = inventory.games as unknown as readonly AuditedControlGame[];
/** The source inventory describes circuit controls, not implemented browser drivers. */
export function getControlSchema(gameId: string): GameControlSchema | undefined {
  const game = auditedGames.find((entry) => entry.id === gameId);
  if (!game) return undefined;
  return {
    gameId, players: game.max_players_indicated,
    families: [...new Set(game.controls.map((control) => control.kind))],
    controls: game.controls.map((control) => ({ family: control.kind, player: control.slot, label: control.label, sourceChip: control.chip })),
    runtime: gameId === 'pong' ? 'pong' : 'not-implemented', keyboardActions: gameId === 'pong' ? [...ACTION_IDS] : [],
  };
}
