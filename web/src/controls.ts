import { ACTION_IDS, cloneBindings, type ActionId, type Bindings } from './control-schema';
export type { ActionId, Bindings, KeyboardBindings, GamepadBindings, GamepadPlayerBinding, GamepadButtonBinding } from './control-schema';
export { ACTION_IDS, ACTION_LABELS, DEFAULT_BINDINGS, cloneBindings, keyLabel, validateBindings } from './control-schema';

export interface ConnectedGamepad { index: number; id: string; mapping: string; axes: number; buttons: number }
export interface ControlState { heldKeys: string[]; directions: [number, number]; gamepads: ConnectedGamepad[] }
export interface ControlOptions {
  bindings: Bindings;
  onDirections: (directions: [number, number]) => void;
  onAxes: (axes: [number | null, number | null]) => void;
  onAction: (action: 'coin' | 'menu' | 'reset' | 'mute') => void;
  onGamepads?: (gamepads: ConnectedGamepad[]) => void;
  onDisconnect?: () => void;
}
export interface Controls {
  handleKeyDown(event: KeyboardEvent): boolean;
  handleKeyUp(event: KeyboardEvent): boolean;
  release(): void;
  setEnabled(enabled: boolean): void;
  setBindings(bindings: Bindings): void;
  pollGamepads(gamepads?: readonly (Gamepad | null)[]): void;
  getState(): ControlState;
}
const directional = new Set<ActionId>(['p1Up', 'p1Down', 'p2Up', 'p2Down']);
const pressed = (button: GamepadButton | undefined): boolean => !!button && (button.pressed || (Number.isFinite(button.value) && button.value >= 0.5));
const editable = (target: EventTarget | null): boolean => typeof Element !== 'undefined' && target instanceof Element && !!target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"])');

/** Input-only adapter. The shell owns focus, pointer capture, clock and audio gestures. */
export function createControls(options: ControlOptions): Controls {
  let bindings = cloneBindings(options.bindings);
  let enabled = false;
  const heldKeys = new Set<string>();
  const heldButtons = new Set<ActionId>();
  const armedButtons = new Map<string, boolean>();
  const lastButtons = new Map<string, boolean>();
  const armedAxes: [boolean, boolean] = [false, false];
  const lastAxes: [number | undefined, number | undefined] = [undefined, undefined];
  let directions: [number, number] = [0, 0];
  let connected: ConnectedGamepad[] = [];
  let revision = 0;

  function updateDirections(): void {
    const active = (action: ActionId): boolean => heldButtons.has(action) || bindings.keyboard[action].some((code) => heldKeys.has(code));
    const next: [number, number] = [Number(active('p1Down')) - Number(active('p1Up')), Number(active('p2Down')) - Number(active('p2Up'))];
    if (next[0] !== directions[0] || next[1] !== directions[1]) { directions = next; options.onDirections([...next]); }
  }
  function release(): void {
    revision += 1;
    heldKeys.clear(); heldButtons.clear();
    armedAxes.fill(false); lastAxes.fill(undefined);
    armedButtons.clear(); lastButtons.clear();
    directions = [0, 0]; options.onDirections([0, 0]);
  }
  function actionFor(code: string): ActionId | undefined { return ACTION_IDS.find((action) => bindings.keyboard[action].includes(code)); }
  function defaultPads(): readonly (Gamepad | null)[] {
    try { return typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; }
    catch { return []; }
  }

  return {
    handleKeyDown(event) {
      if (!enabled || event.altKey || event.ctrlKey || event.metaKey || editable(event.target)) return false;
      const action = actionFor(event.code);
      if (!action) return false;
      event.preventDefault();
      if (heldKeys.has(event.code) || event.repeat) return true;
      heldKeys.add(event.code);
      if (directional.has(action)) updateDirections();
      else options.onAction(action as 'coin' | 'menu' | 'reset' | 'mute');
      return true;
    },
    handleKeyUp(event) {
      if (!heldKeys.delete(event.code)) return false;
      event.preventDefault(); updateDirections(); return true;
    },
    release,
    setEnabled(next) { if (enabled !== next) { enabled = next; release(); } },
    setBindings(next) { bindings = cloneBindings(next); release(); },
    pollGamepads(supplied) {
      const pads = supplied ?? defaultPads();
      const nextConnected = pads.filter((pad): pad is Gamepad => !!pad && pad.connected !== false).map((pad) => ({ index: pad.index, id: pad.id, mapping: pad.mapping, axes: pad.axes.length, buttons: pad.buttons.length }));
      const disconnected = connected.some((old) => !nextConnected.some((pad) => pad.index === old.index && pad.id === old.id));
      if (disconnected) { release(); options.onDisconnect?.(); }
      if (JSON.stringify(nextConnected) !== JSON.stringify(connected)) { connected = nextConnected; options.onGamepads?.(structuredClone(connected)); }
      const byIndex = new Map(pads.filter((pad): pad is Gamepad => !!pad && pad.connected !== false).map((pad) => [pad.index, pad]));
      if (!enabled) return;
      const ownRevision = revision;
      const axisChanges: [number | null, number | null] = [null, null];
      bindings.gamepad.players.forEach((binding, slot) => {
        const pad = byIndex.get(binding.pad);
        const raw = pad?.axes[binding.axis];
        if (raw === undefined || !Number.isFinite(raw)) { armedAxes[slot] = false; lastAxes[slot] = undefined; return; }
        const value = Math.max(-1, Math.min(1, raw)) * (binding.invert ? -1 : 1);
        if (Math.abs(value) <= binding.deadzone) { armedAxes[slot] = true; lastAxes[slot] = undefined; return; }
        if (!armedAxes[slot]) return;
        const scaled = Math.sign(value) * (Math.abs(value) - binding.deadzone) / (1 - binding.deadzone);
        const axis = Math.round(scaled * (scaled < 0 ? 32768 : 32767));
        if (axis !== lastAxes[slot]) { lastAxes[slot] = axis; axisChanges[slot] = axis; }
      });
      if (axisChanges.some((axis) => axis !== null)) options.onAxes(axisChanges);
      heldButtons.clear();
      for (const action of ACTION_IDS) for (const binding of bindings.gamepad.buttons[action]) {
        const key = `${binding.pad}:${binding.button}`;
        const pad = byIndex.get(binding.pad);
        const down = pressed(pad?.buttons[binding.button]);
        if (!pad) { armedButtons.delete(key); lastButtons.delete(key); continue; }
        if (!down) armedButtons.set(key, true);
        const armed = armedButtons.get(key) === true;
        if (armed && down) {
          if (directional.has(action)) heldButtons.add(action);
          else if (!lastButtons.get(key)) options.onAction(action as 'coin' | 'menu' | 'reset' | 'mute');
        }
        lastButtons.set(key, down);
        // A menu/reset action may synchronously disable/release this adapter.
        if (!enabled || revision !== ownRevision) { heldButtons.clear(); updateDirections(); return; }
      }
      updateDirections();
    },
    getState() { return { heldKeys: [...heldKeys], directions: [...directions], gamepads: structuredClone(connected) }; },
  };
}
