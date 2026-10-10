// NoCPU contextual settings interface, GPL-3.0-or-later.
import { GAMES } from './catalog';
import { escapeText } from './shell-ui';
import { ACTION_IDS, ACTION_LABELS, cloneBindings, keyLabel, validateBindings, type ActionId } from './control-schema';
import { loadPreferences, savePreferences, type Preferences } from './preferences';
import { createRomLibrary, type RomEntry } from './roms';
import type { ConnectedGamepad } from './controls';

interface SettingsOptions {
  onPreferences: (preferences: Preferences) => void;
  onBindings: (preferences: Preferences) => void;
  onCaptureStarted: () => void;
  onMetadataChanged: () => void;
}
type Capture = { kind: 'keyboard'; action: ActionId } | { kind: 'button'; action: ActionId } | { kind: 'axis'; slot: 0 | 1 };

export function createSettingsUI(options: SettingsOptions) {
  const find = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
  let loaded = loadPreferences();
  let preferences = loaded.preferences;
  let capture: Capture | undefined;
  let captureFocusId: string | undefined;
  const blocked = new Set<string>();
  let entries: RomEntry[] = [];
  let romBusy = false;
  let refreshId = 0;
  const library = createRomLibrary();
  const bindingMessage = find('#binding-message');
  const cancelButton = find<HTMLButtonElement>('#cancel-binding');
  const romFile = find<HTMLInputElement>('#rom-file');
  const romGame = find<HTMLSelectElement>('#rom-game');
  const remember = find<HTMLInputElement>('#remember-roms');
  const romStatus = find('[data-testid="rom-import-status"]');

  function preferencesStatus(): void {
    find('[data-testid="preferences-status"]').textContent = loaded.status === 'available'
      ? 'Settings are saved on this device.' : loaded.message ?? 'Settings work for this session; saving is unavailable.';
  }
  function setPreferences(next: Preferences): void {
    const bindingsChanged = JSON.stringify(next.bindings) !== JSON.stringify(preferences.bindings);
    loaded = savePreferences(next);
    preferences = loaded.preferences;
    preferencesStatus();
    options.onPreferences(preferences);
    if (bindingsChanged) options.onBindings(preferences);
  }
  function renderBindings(): void {
    const focusId = document.activeElement?.getAttribute('data-testid');
    find('#keyboard-bindings').innerHTML = ACTION_IDS.map((action) => `<div class="binding-row"><span>${escapeText(ACTION_LABELS[action])}</span><button data-bind-key="${action}" data-testid="binding-${action}" aria-label="Assign key for ${escapeText(ACTION_LABELS[action])}">${preferences.bindings.keyboard[action].map(keyLabel).map(escapeText).join(' / ') || 'Unassigned'}</button></div>`).join('');
    find('#gamepad-players').innerHTML = preferences.bindings.gamepad.players.map((player, slot) => `<fieldset class="gamepad-player"><legend>Player ${slot + 1} joystick</legend><label>Controller<select data-player-setting="pad" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-pad" aria-label="Player ${slot + 1} controller">${Array.from({ length: 8 }, (_, index) => `<option value="${index}"${index === player.pad ? ' selected' : ''}>Controller ${index + 1}</option>`).join('')}</select></label><label>Axis<select data-player-setting="axis" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-axis" aria-label="Player ${slot + 1} joystick axis">${Array.from({ length: 16 }, (_, index) => `<option value="${index}"${index === player.axis ? ' selected' : ''}>Axis ${index + 1}</option>`).join('')}</select></label><label class="checkbox-label"><input type="checkbox" data-player-setting="invert" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-invert"${player.invert ? ' checked' : ''} /> Reverse direction</label><label>Deadzone <span>${Math.round(player.deadzone * 100)}%</span><input type="range" min="5" max="50" step="1" value="${Math.round(player.deadzone * 100)}" data-player-setting="deadzone" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-deadzone" aria-label="Player ${slot + 1} joystick deadzone" /></label><button data-bind-axis="${slot}" data-testid="bind-axis-p${slot + 1}">Assign by moving joystick up</button></fieldset>`).join('');
    find('#gamepad-bindings').innerHTML = ACTION_IDS.map((action) => `<div class="binding-row"><span>${escapeText(ACTION_LABELS[action])}</span><button data-bind-button="${action}" data-testid="gamepad-binding-${action}" aria-label="Assign controller button for ${escapeText(ACTION_LABELS[action])}">${preferences.bindings.gamepad.buttons[action].map((binding) => `Controller ${binding.pad + 1} · button ${binding.button + 1}`).join(' / ') || 'Unassigned'}</button></div>`).join('');
    if (focusId && /^(binding-|gamepad-binding-|gamepad-p|bind-axis-p)/.test(focusId)) {
      document.querySelector<HTMLElement>(`[data-testid="${focusId}"]`)?.focus({ preventScroll: true });
    }
  }
  function cancelCapture(message = 'Assignment cancelled.'): void {
    if (!capture) return;
    capture = undefined;
    blocked.clear();
    cancelButton.hidden = true;
    bindingMessage.textContent = message;
    if (captureFocusId && !find('[data-panel="settings"]').hidden) {
      document.querySelector<HTMLElement>(`[data-testid="${captureFocusId}"]`)?.focus({ preventScroll: true });
    }
    captureFocusId = undefined;
  }
  function readPads(): (Gamepad | null)[] {
    try { return typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()] : []; }
    catch { return []; }
  }
  function beginCapture(next: Capture): void {
    options.onCaptureStarted();
    capture = next;
    captureFocusId = next.kind === 'keyboard' ? `binding-${next.action}` : next.kind === 'button'
      ? `gamepad-binding-${next.action}` : `bind-axis-p${next.slot + 1}`;
    blocked.clear();
    for (const pad of readPads()) {
      if (!pad?.connected) continue;
      pad.axes.forEach((axis, index) => { if (Math.abs(axis) > .3) blocked.add(`a${pad.index}:${index}`); });
      pad.buttons.forEach((button, index) => { if (button.pressed || button.value > .5) blocked.add(`b${pad.index}:${index}`); });
    }
    cancelButton.hidden = false;
    bindingMessage.textContent = next.kind === 'keyboard' ? `Press a key for ${ACTION_LABELS[next.action]}. Escape cancels.`
      : next.kind === 'button' ? `Press a controller button for ${ACTION_LABELS[next.action]}. Escape cancels.`
        : `Move the joystick up for player ${next.slot + 1}. Escape cancels.`;
  }
  function applyBindings(candidate: Preferences['bindings'], message: string): boolean {
    const result = validateBindings(candidate);
    if (!result.ok) { bindingMessage.textContent = result.errors.join(' '); return false; }
    setPreferences({ ...preferences, bindings: result.bindings });
    cancelCapture(message);
    renderBindings();
    bindingMessage.textContent = message;
    return true;
  }
  function handleCaptureKey(event: KeyboardEvent): boolean {
    if (!capture) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return true;
    if (event.code === 'Escape') { cancelCapture(); return true; }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      bindingMessage.textContent = 'Use a key without Ctrl, Alt or Meta. Escape cancels.';
      return true;
    }
    if (capture.kind !== 'keyboard') return true;
    const candidate = cloneBindings(preferences.bindings);
    candidate.keyboard[capture.action] = [event.code];
    applyBindings(candidate, `${ACTION_LABELS[capture.action]} uses ${keyLabel(event.code)}.`);
    return true;
  }
  function pollCapture(): void {
    if (!capture || capture.kind === 'keyboard') return;
    for (const pad of readPads()) {
      if (!pad?.connected) continue;
      pad.axes.forEach((axis, index) => { if (Math.abs(axis) <= .3) blocked.delete(`a${pad.index}:${index}`); });
      pad.buttons.forEach((button, index) => { if (!button.pressed && button.value <= .5) blocked.delete(`b${pad.index}:${index}`); });
      const candidate = cloneBindings(preferences.bindings);
      if (capture.kind === 'axis') {
        const axis = pad.axes.findIndex((value, index) => Math.abs(value) >= .65 && !blocked.has(`a${pad.index}:${index}`));
        if (axis === -1) continue;
        const slot = capture.slot;
        candidate.gamepad.players[slot] = { ...candidate.gamepad.players[slot], pad: pad.index, axis, invert: pad.axes[axis] > 0 };
        blocked.add(`a${pad.index}:${axis}`);
        applyBindings(candidate, `Player ${slot + 1} joystick assigned.`);
      } else {
        const button = pad.buttons.findIndex((value, index) => (value.pressed || value.value > .5) && !blocked.has(`b${pad.index}:${index}`));
        if (button === -1) continue;
        const action = capture.action;
        candidate.gamepad.buttons[action] = [{ pad: pad.index, button }];
        blocked.add(`b${pad.index}:${button}`);
        applyBindings(candidate, `${ACTION_LABELS[action]} controller button assigned.`);
      }
      return;
    }
  }
  function syncGamepads(pads: ConnectedGamepad[]): void {
    find('[data-testid="gamepad-status"]').textContent = typeof navigator.getGamepads !== 'function'
      ? 'Gamepads are unavailable in this browser. Keyboard and touch controls remain available.' : pads.length
      ? pads.map((pad) => `Controller ${pad.index + 1}: ${pad.id}`).join(' · ')
      : 'No gamepad detected. Connect one and press a button. Keyboard and touch controls remain available.';
  }
  function romDescription(gameId: string): string {
    const entry = entries.find((value) => value.gameId === gameId);
    if (!GAMES.find((game) => game.id === gameId)?.roms.length) return 'No ROM needed';
    if (entry?.status === 'ready') return `Validated locally · ${entry.storage === 'device' ? 'saved on this device' : 'this session'}`;
    if (entry?.storage === 'device') return 'Saved ROM needs re-import';
    return 'ROM required · not imported';
  }
  function renderRoms(): void {
    const saved = entries.filter((entry) => entry.status === 'ready' || entry.storage === 'device');
    find('.rom-list').innerHTML = saved.length ? saved.map((entry) => `<div class="rom-entry" data-testid="rom-item-${entry.gameId}"><strong>${escapeText(GAMES.find((game) => game.id === entry.gameId)?.name ?? entry.gameId)}</strong><span class="rom-file-name">${escapeText(entry.fileName ?? 'Saved archive')}</span><span>${entry.status !== 'ready' ? 'Needs re-import' : entry.storage === 'device' ? 'Saved on this device' : 'Available this session'}</span>${entry.message ? `<p>${escapeText(entry.message)}</p>` : ''}<div class="menu-inline-actions"><button data-remove-rom="${entry.gameId}" data-testid="remove-${entry.gameId}">Remove</button>${entry.status === 'ready' ? `<button data-export-rom="${entry.gameId}" data-testid="export-${entry.gameId}">Save a backup</button>` : ''}</div></div>`).join('') : '<p>No local ROM sets are available. Re-import your ZIP if browser storage was cleared.</p>';
    const problems = entries.filter((entry) => entry.message).map((entry) => entry.message!);
    find('[data-testid="storage-status"]').textContent = problems.length ? [...new Set(problems)].join(' ')
      : 'Remember is optional. Keep your original ZIP as a backup; browser storage can be cleared.';
    toggleRomBusy(romBusy);
  }
  function toggleRomBusy(value: boolean): void {
    romBusy = value;
    romFile.disabled = value;
    romGame.disabled = value;
    remember.disabled = value;
    find('.rom-list').querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = value; });
  }
  async function refreshRoms(): Promise<void> {
    const ownRefresh = ++refreshId;
    try {
      const result = await library.list();
      if (ownRefresh !== refreshId) return;
      entries = result;
      renderRoms();
      options.onMetadataChanged();
    } catch {
      find('[data-testid="storage-status"]').textContent = 'Local ROM storage is unavailable. Pong is still ready to play.';
    }
  }
  async function importRom(): Promise<void> {
    const file = romFile.files?.[0];
    if (!file || romBusy) return;
    const gameId = romGame.value;
    toggleRomBusy(true);
    romStatus.textContent = 'Checking ROM ZIP…';
    try {
      const result = await library.importArchive(gameId, file, remember.checked);
      romStatus.textContent = result.ok ? `${GAMES.find((game) => game.id === gameId)?.name}: ROM validated. ${result.value.message ?? (result.value.storage === 'device' ? 'Saved on this device.' : 'Available this session.')}` : result.error;
      await refreshRoms();
    } catch { romStatus.textContent = 'The ROM ZIP could not be read. Choose a compatible file and try again.'; }
    finally { romFile.value = ''; toggleRomBusy(false); }
  }
  async function removeRom(gameId: string): Promise<void> {
    if (romBusy) return;
    toggleRomBusy(true);
    try {
      const result = await library.remove(gameId);
      romStatus.textContent = result.ok ? result.value.message ?? 'Local ROM set removed.' : result.error;
      await refreshRoms();
    } catch { romStatus.textContent = 'The local ROM set could not be removed. Try again.'; }
    finally {
      toggleRomBusy(false);
      if (!find('[data-panel="settings"]').hidden && !document.hidden) romGame.focus({ preventScroll: true });
    }
  }
  async function exportRom(gameId: string): Promise<void> {
    if (romBusy) return;
    toggleRomBusy(true);
    try {
      const result = await library.exportArchive(gameId);
      if (!result.ok) { romStatus.textContent = result.error; return; }
      const url = URL.createObjectURL(result.value.blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = result.value.fileName;
      download.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      romStatus.textContent = 'Backup download started. Keep the ZIP for re-import if browser storage is cleared.';
    } catch { romStatus.textContent = 'The backup could not be saved. Keep your original ZIP for re-import.'; }
    finally { toggleRomBusy(false); }
  }
  find('[data-panel="settings"]').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    button.focus({ preventScroll: true });
    if (button.dataset.bindKey) beginCapture({ kind: 'keyboard', action: button.dataset.bindKey as ActionId });
    else if (button.dataset.bindButton) beginCapture({ kind: 'button', action: button.dataset.bindButton as ActionId });
    else if (button.dataset.bindAxis) beginCapture({ kind: 'axis', slot: Number(button.dataset.bindAxis) as 0 | 1 });
    else if (button.dataset.removeRom) void removeRom(button.dataset.removeRom);
    else if (button.dataset.exportRom) void exportRom(button.dataset.exportRom);
  });
  find('#gamepad-players').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const slot = Number(input.dataset.slot) as 0 | 1;
    const property = input.dataset.playerSetting;
    if (!property || ![0, 1].includes(slot)) return;
    const candidate = cloneBindings(preferences.bindings);
    if (property === 'invert') candidate.gamepad.players[slot].invert = (input as HTMLInputElement).checked;
    else if (property === 'pad' || property === 'axis') candidate.gamepad.players[slot][property] = Number(input.value);
    else if (property === 'deadzone') candidate.gamepad.players[slot].deadzone = Number(input.value) / 100;
    if (!applyBindings(candidate, 'Controller settings saved.')) renderBindings();
  });
  cancelButton.addEventListener('click', () => cancelCapture());
  find('#controls-defaults').addEventListener('click', () => applyBindings(cloneBindings(), 'Default controls restored.'));
  romFile.addEventListener('change', () => { void importRom(); });
  preferencesStatus();
  renderBindings();
  void refreshRoms();
  return {
    get preferences() { return preferences; },
    get capturing() { return !!capture; },
    setVolume: (volume: number) => setPreferences({ ...preferences, volume }),
    setMuted: (muted: boolean) => setPreferences({ ...preferences, muted }),
    cancelCapture, handleCaptureKey, pollCapture, syncGamepads, refreshRoms, romDescription,
    selectRomGame: (gameId: string) => { if (GAMES.find((game) => game.id === gameId)?.roms.length) romGame.value = gameId; },
  };
}
