import { actionsForGame, cloneBindings, controlPlayerCount, directionAction, type ActionId, type Bindings, type GameAction } from './control-schema';
import { registeredGame, type PlayableGameId } from './game-contract';
export type { ActionId, Bindings, KeyboardBindings, GamepadBindings, GamepadPlayerBinding, GamepadButtonBinding } from './control-schema';
export { ACTION_IDS, ACTION_LABELS, DEFAULT_BINDINGS, cloneBindings, keyLabel, validateBindings } from './control-schema';
export interface ConnectedGamepad { index: number; id: string; mapping: string; axes: number; buttons: number }
export interface ControlState { heldKeys: string[]; directions: number[]; serve: boolean; gas: boolean[]; brake: boolean[]; held: boolean[]; gamepads: ConnectedGamepad[] }
export interface ControlOptions {
  bindings: Bindings; gameId?: PlayableGameId;
  onDirections: (directions: number[]) => void;
  onAxes: (axes: (number | null)[]) => void;
  onAction: (action: GameAction) => void;
  onServe?: (held: boolean) => void;
  onButtons?: (gas: boolean[], brake: boolean[]) => void;
  /** Registered games: their held BUTTONSn switches, in definition order. */
  onHeldButtons?: (held: boolean[]) => void;
  onGamepads?: (gamepads: ConnectedGamepad[]) => void;
  onDisconnect?: () => void;
}
export interface Controls {
  handleKeyDown(event: KeyboardEvent): boolean; handleKeyUp(event: KeyboardEvent): boolean;
  release(): void; setEnabled(enabled: boolean): void; setBindings(bindings: Bindings): void;
  setGame(gameId: PlayableGameId, bindings: Bindings): void;
  /** A held Serve from the mouse button over the display (Breakout). */
  setPointerServe(held: boolean): void;
  /** A held registered button from a mouse button over the display (game.mouse). */
  setPointerAction(action: ActionId, held: boolean): void;
  pollGamepads(gamepads?: readonly (Gamepad | null)[]): void; getState(): ControlState;
}
const directional = (action: ActionId): boolean => /^p[1-4](Up|Down|Left|Right)$/.test(action);
const pedal = (action: ActionId): boolean => /^p[1-4](Gas|Brake|Fire)$/.test(action);
const pressed = (button: GamepadButton | undefined): boolean => !!button && (button.pressed || (Number.isFinite(button.value) && button.value >= 0.5));
const editable = (target: EventTarget | null): boolean => typeof Element !== 'undefined' && target instanceof Element && !!target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"])');
/** Input-only adapter; joystick games combine held switches, paddle games retain absolute positions. */
export function createControls(options: ControlOptions): Controls {
  let gameId: PlayableGameId = options.gameId ?? 'pong';
  let bindings = cloneBindings(options.bindings);
  let enabled = false;
  const heldKeys = new Set<string>();
  const heldButtons = new Set<ActionId>();
  const armedButtons = new Map<string, boolean>();
  const lastButtons = new Map<string, boolean>();
  let armedAxes: boolean[] = [];
  let lastAxes: (number | undefined)[] = [];
  let axisDirections: number[] = [];
  let gas: boolean[] = [];
  let brake: boolean[] = [];
  let held: boolean[] = [];
  let directions: number[] = [];
  let pointerServe = false;
  const pointerActions = new Set<ActionId>();
  let serve = false;
  let connected: ConnectedGamepad[] = [];
  let revision = 0;
  function resetPlayers(): void {
    const count = controlPlayerCount(gameId);
    armedAxes = Array(count).fill(false); lastAxes = Array(count).fill(undefined);
    axisDirections = Array(count).fill(0);
    directions = Array(count).fill(0);
    gas = Array(count).fill(false); brake = Array(count).fill(false);
    held = Array(registeredGame(gameId)?.buttons.length ?? 0).fill(false);
  }
  resetPlayers();
  function updateDirections(): void {
    const active = (action: ActionId): boolean => heldButtons.has(action) || bindings.keyboard[action].some((code) => heldKeys.has(code));
    const next = directions.map((_, slot) => {
      const up = active(directionAction(slot, 'Up', gameId)) || axisDirections[slot] < 0;
      const down = active(directionAction(slot, 'Down', gameId)) || axisDirections[slot] > 0;
      return Number(down) - Number(up);
    });
    if (next.some((direction, slot) => direction !== directions[slot])) { directions = next; options.onDirections([...next]); }
  }
  function updateServe(): void {
    const next = enabled && gameId === 'breakout' && (pointerServe || heldButtons.has('serve') || bindings.keyboard.serve.some((code) => heldKeys.has(code)));
    if (next !== serve) { serve = next; options.onServe?.(next); }
  }
  function updatePedals(): void {
    const active = (action: ActionId): boolean => heldButtons.has(action) || pointerActions.has(action) || bindings.keyboard[action].some((code) => heldKeys.has(code));
    const nextGas = gas.map((_, slot) => enabled && gameId === 'indy4' && active(`p${slot + 1}Gas` as ActionId));
    const nextBrake = brake.map((_, slot) => enabled && gameId === 'indy4' && active(`p${slot + 1}Brake` as ActionId));
    if (nextGas.some((held, slot) => held !== gas[slot]) || nextBrake.some((held, slot) => held !== brake[slot])) {
      gas = nextGas; brake = nextBrake; options.onButtons?.([...gas], [...brake]);
    }
    const nextHeld = (registeredGame(gameId)?.buttons ?? []).map((button) => enabled && active(button.action));
    if (nextHeld.some((down, index) => down !== held[index])) { held = nextHeld; options.onHeldButtons?.([...held]); }
  }
  function release(): void {
    revision += 1; heldKeys.clear(); heldButtons.clear(); armedButtons.clear(); lastButtons.clear();
    pointerServe = false; pointerActions.clear(); updateServe(); updatePedals();
    resetPlayers(); options.onDirections([...directions]);
  }
  function actionFor(code: string): ActionId | undefined { return actionsForGame(gameId).find((action) => bindings.keyboard[action].includes(code)); }
  function defaultPads(): readonly (Gamepad | null)[] {
    try { return typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch { return []; }
  }
  return {
    handleKeyDown(event) {
      if (!enabled || event.altKey || event.ctrlKey || event.metaKey || editable(event.target)) return false;
      const action = actionFor(event.code); if (!action) return false;
      event.preventDefault(); if (heldKeys.has(event.code) || event.repeat) return true;
      heldKeys.add(event.code); if (directional(action)) updateDirections(); else if (action === 'serve') updateServe(); else if (pedal(action)) updatePedals(); else options.onAction(action as GameAction);
      return true;
    },
    handleKeyUp(event) {
      if (!heldKeys.delete(event.code)) return false;
      event.preventDefault(); updateDirections(); updateServe(); updatePedals(); return true;
    },
    release,
    setEnabled(next) { if (enabled !== next) { enabled = next; release(); } },
    setBindings(next) { bindings = cloneBindings(next); release(); },
    setGame(next, nextBindings) { release(); gameId = next; bindings = cloneBindings(nextBindings); resetPlayers(); },
    setPointerServe(held) { if (!enabled || gameId !== 'breakout') return; pointerServe = held; updateServe(); },
    setPointerAction(action, held) {
      const mouse = registeredGame(gameId)?.mouse;
      if (!enabled || !mouse || (action !== mouse.left && action !== mouse.right)) return;
      if (held) pointerActions.add(action); else pointerActions.delete(action);
      updatePedals();
    },
    pollGamepads(supplied) {
      const pads = supplied ?? defaultPads();
      const nextConnected = pads.filter((pad): pad is Gamepad => !!pad && pad.connected !== false).map((pad) => ({ index: pad.index, id: pad.id, mapping: pad.mapping, axes: pad.axes.length, buttons: pad.buttons.length }));
      const disconnected = connected.some((old) => !nextConnected.some((pad) => pad.index === old.index && pad.id === old.id));
      if (disconnected) { release(); options.onDisconnect?.(); }
      if (JSON.stringify(nextConnected) !== JSON.stringify(connected)) { connected = nextConnected; options.onGamepads?.(structuredClone(connected)); }
      const byIndex = new Map(pads.filter((pad): pad is Gamepad => !!pad && pad.connected !== false).map((pad) => [pad.index, pad]));
      if (!enabled) return;
      const ownRevision = revision;
      const axisChanges: (number | null)[] = Array(controlPlayerCount(gameId)).fill(null);
      bindings.gamepad.players.forEach((binding, slot) => {
        const raw = byIndex.get(binding.pad)?.axes[binding.axis];
        if (raw === undefined || !Number.isFinite(raw)) { armedAxes[slot] = false; lastAxes[slot] = undefined; axisDirections[slot] = 0; return; }
        const value = Math.max(-1, Math.min(1, raw)) * (binding.invert ? -1 : 1);
        if (Math.abs(value) <= binding.deadzone) {
          armedAxes[slot] = true; axisDirections[slot] = 0;
          if (gameId === 'indy4' || gameId === 'stuntcycle' || registeredGame(gameId)?.channels[slot]?.kind === 'wheel') {
            if (lastAxes[slot] !== 0) axisChanges[slot] = 0;
            lastAxes[slot] = 0;
          } else lastAxes[slot] = undefined;
          return;
        }
        if (!armedAxes[slot]) { axisDirections[slot] = 0; return; }
        // Digital joysticks: a moved stick holds that direction's switch.
        if (gameId === 'spacerace' || registeredGame(gameId)?.channels[slot]?.kind === 'stick') { axisDirections[slot] = Math.sign(value); return; }
        const scaled = Math.sign(value) * (Math.abs(value) - binding.deadzone) / (1 - binding.deadzone);
        const axis = gameId === 'stuntcycle' ? Math.round(Math.max(0, scaled) * 32767)
          : Math.round(scaled * (scaled < 0 ? 32768 : 32767));
        if (axis !== lastAxes[slot]) { lastAxes[slot] = axis; axisChanges[slot] = axis; }
      });
      if (axisChanges.some((axis) => axis !== null)) options.onAxes(axisChanges);
      heldButtons.clear();
      for (const action of actionsForGame(gameId)) for (const binding of bindings.gamepad.buttons[action]) {
        const key = `${binding.pad}:${binding.button}`;
        const pad = byIndex.get(binding.pad); const down = pressed(pad?.buttons[binding.button]);
        if (!pad) { armedButtons.delete(key); lastButtons.delete(key); continue; }
        if (!down) armedButtons.set(key, true);
        if (armedButtons.get(key) === true && down) {
          if (directional(action) || action === 'serve' || pedal(action)) heldButtons.add(action);
          else if (!lastButtons.get(key)) options.onAction(action as GameAction);
        }
        lastButtons.set(key, down);
        if (!enabled || revision !== ownRevision) { heldButtons.clear(); updateDirections(); updateServe(); updatePedals(); return; }
      }
      updateDirections(); updateServe(); updatePedals();
    },
    getState() { return { heldKeys: [...heldKeys], directions: [...directions], serve, gas: [...gas], brake: [...brake], held: [...held], gamepads: structuredClone(connected) }; },
  };
}
