// NoCPU contextual settings interface, GPL-3.0-or-later.
import { GAMES } from './catalog';
import { escapeText } from './shell-ui';
import { actionsForGame, actionLabel, cloneBindings, defaultBindings, keyLabel, validateBindings, type ActionId } from './control-schema';
import { gameBindings, isMouseGame, withGameBindings, loadPreferences, savePreferences, type Preferences } from './preferences';
import { createRomLibrary, type RomEntry } from './roms';
import type { ConnectedGamepad } from './controls';
import { gameSpec, isPlayableGameId, normalizeGameOptions, registeredGame, type PlayableGameId } from './game-contract';
import type { GameDefinition, RegisteredOptions } from './games/types';

/** Settings controls of a registered game, from its original DIP/potentiometer descriptors. */
function registeredOptionsMarkup(game: GameDefinition, options: RegisteredOptions): string {
  return game.settings.map((setting) => setting.kind === 'select'
    ? `<label for="${setting.testId}">${escapeText(setting.label)}</label><select id="${setting.testId}" data-testid="${setting.testId}" data-option="${setting.key}">${setting.choices.map((choice) => `<option value="${choice.value}"${choice.value === options[setting.key] ? ' selected' : ''}>${escapeText(choice.label)}</option>`).join('')}</select>`
    : `<label for="${setting.testId}">${escapeText(setting.label)} <span data-testid="playtime-value">${(options[setting.key] - setting.minOhms) / ((setting.maxOhms - setting.minOhms) / 100)}%</span></label><input id="${setting.testId}" data-testid="${setting.testId}" data-option="${setting.key}" type="range" min="0" max="100" step="0.1" value="${(options[setting.key] - setting.minOhms) / ((setting.maxOhms - setting.minOhms) / 100)}" aria-label="${escapeText(setting.label)}" /><p class="panel-note">A higher setting allows more time. The original default is ${Math.round((setting.defaultOhms - setting.minOhms) / ((setting.maxOhms - setting.minOhms) / 100))}%.</p>`).join('');
}

interface SettingsOptions {
  onPreferences: (preferences: Preferences) => void;
  onBindings: (preferences: Preferences) => void;
  onCaptureStarted: () => void;
  onMetadataChanged: () => void;
  onApplyGameOptions: (gameId: PlayableGameId) => void;
  onPlayRom: (gameId: PlayableGameId) => void;
  onRomRemoved: (gameId: string) => void;
  onMouse: () => void;
}
type Capture = { kind: 'keyboard'; action: ActionId } | { kind: 'button'; action: ActionId } | { kind: 'axis'; slot: number };

export function createSettingsUI(options: SettingsOptions) {
  const find = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
  let loaded = loadPreferences();
  let preferences = loaded.preferences;
  let controlGameId: PlayableGameId = 'pong';
  let activeGameId: PlayableGameId | undefined;
  const selectedBindings = () => gameBindings(preferences, controlGameId);
  const label = (action: ActionId) => actionLabel(action, controlGameId);
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
    const bindingsChanged = JSON.stringify([next.bindings, next.bindingsByGame]) !== JSON.stringify([preferences.bindings, preferences.bindingsByGame]);
    loaded = savePreferences(next);
    preferences = loaded.preferences;
    preferencesStatus();
    options.onPreferences(preferences);
    if (bindingsChanged) options.onBindings(preferences);
  }
  // Remembering the last game is not a settings change, so a load or migration
  // notice stays visible; only a newly failing save is reported.
  function setLastGame(lastGameId: PlayableGameId): void {
    if (preferences.lastGameId === lastGameId) return;
    const saved = savePreferences({ ...preferences, lastGameId });
    preferences = saved.preferences;
    if (saved.status === 'unavailable' && loaded.status === 'available') { loaded = saved; preferencesStatus(); }
  }
  function renderBindings(): void {
    const bindings = selectedBindings();
    const actions = actionsForGame(controlGameId);
    find('#controls-heading').textContent = `${gameSpec(controlGameId).title} controls`;
    const focusId = document.activeElement?.getAttribute('data-testid');
    find('#keyboard-bindings').innerHTML = actions.map((action) => `<div class="binding-row"><span>${escapeText(label(action))}</span><button data-bind-key="${action}" data-testid="binding-${action}" aria-label="Assign key for ${escapeText(label(action))}">${bindings.keyboard[action].map(keyLabel).map(escapeText).join(' / ') || 'Unassigned'}</button></div>`).join('');
    find('#gamepad-players').innerHTML = bindings.gamepad.players.map((player, slot) => `<fieldset class="gamepad-player"><legend>${registeredGame(controlGameId) ? `${escapeText(gameSpec(controlGameId).controlLabels[slot])} joystick axis` : controlGameId === 'stuntcycle' ? 'Shared throttle joystick' : controlGameId === 'indy4' ? `Player ${slot + 1} ${['Green', 'Cyan', 'Violet', 'Red'][slot]} steering` : controlGameId === 'breakout' ? 'Shared paddle joystick' : `Player ${slot + 1} joystick`}</legend><label>Controller<select data-player-setting="pad" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-pad" aria-label="Player ${slot + 1} controller">${Array.from({ length: 8 }, (_, index) => `<option value="${index}"${index === player.pad ? ' selected' : ''}>Controller ${index + 1}</option>`).join('')}</select></label><label>Axis<select data-player-setting="axis" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-axis" aria-label="Player ${slot + 1} joystick axis">${Array.from({ length: 16 }, (_, index) => `<option value="${index}"${index === player.axis ? ' selected' : ''}>Axis ${index + 1}</option>`).join('')}</select></label><label class="checkbox-label"><input type="checkbox" data-player-setting="invert" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-invert"${player.invert ? ' checked' : ''} /> Reverse direction</label><label>Deadzone <span>${Math.round(player.deadzone * 100)}%</span><input type="range" min="5" max="50" step="1" value="${Math.round(player.deadzone * 100)}" data-player-setting="deadzone" data-slot="${slot}" data-testid="gamepad-p${slot + 1}-deadzone" aria-label="Player ${slot + 1} joystick deadzone" /></label><button data-bind-axis="${slot}" data-testid="bind-axis-p${slot + 1}">Assign by moving joystick ${registeredGame(controlGameId) ? registeredGame(controlGameId)!.channels[slot].orientation === 'horizontal' ? 'left' : 'up' : controlGameId === 'breakout' || controlGameId === 'indy4' ? 'left' : controlGameId === 'stuntcycle' ? 'toward idle' : 'up'}</button></fieldset>`).join('');
    find('#gamepad-bindings').innerHTML = actions.map((action) => `<div class="binding-row"><span>${escapeText(label(action))}</span><button data-bind-button="${action}" data-testid="gamepad-binding-${action}" aria-label="Assign controller button for ${escapeText(label(action))}">${bindings.gamepad.buttons[action].map((binding) => `Controller ${binding.pad + 1} · button ${binding.button + 1}`).join(' / ') || 'Unassigned'}</button></div>`).join('');
    if (focusId && /^(binding-|gamepad-binding-|gamepad-p|bind-axis-p)/.test(focusId)) {
      document.querySelector<HTMLElement>(`[data-testid="${focusId}"]`)?.focus({ preventScroll: true });
    }
  }
  function renderMouse(): void {
    const container = find('#mouse-setting');
    if (!isMouseGame(controlGameId)) {
      container.innerHTML = `<p>${escapeText(gameSpec(controlGameId).title)} uses keyboard or gamepad controls. The mouse is not used for this game.</p>`;
      return;
    }
    const spec = gameSpec(controlGameId);
    const slot = preferences.mouseByGame[controlGameId];
    const how = controlGameId === 'stuntcycle'
      ? 'Hold the left mouse button over the display and move right to open the shared throttle; release the button to idle.'
      : `Move the mouse over the display to position the paddle across its full range${controlGameId === 'breakout' ? '. Hold the left mouse button over the display to hold Serve' : ''}.`;
    container.innerHTML = `<label for="mouse-slot">Mouse controls</label><select id="mouse-slot" data-testid="mouse-slot">${spec.controlLabels.map((label, index) => `<option value="${index}"${slot === index ? ' selected' : ''}>${escapeText(spec.controlSlotCount === 1 ? label : `Player ${index + 1} · ${label.toLowerCase()}`)}</option>`).join('')}<option value="off"${slot === null ? ' selected' : ''}>Off</option></select><p class="panel-note">${how}</p>`;
  }
  function renderOptions(): void {
    const options = preferences.optionsByGame[controlGameId];
    const registered = registeredGame(controlGameId);
    find('#game-options').innerHTML = registered ? registeredOptionsMarkup(registered, options as unknown as RegisteredOptions) : 'misses' in options
      ? `<label for="misses">Misses allowed</label><select id="misses" data-testid="misses">${Array.from({ length: 8 }, (_, misses) => `<option value="${misses}"${misses === options.misses ? ' selected' : ''}>${misses}</option>`).join('')}</select><label for="free-game-score">Free game score</label><select id="free-game-score" data-testid="free-game-score">${Array.from({ length: 16 }, (_, index) => index + 12).map((score) => `<option value="${score}"${score === options.freeGameScore ? ' selected' : ''}>${score}</option>`).join('')}</select><label for="coinage">Coinage</label><select id="coinage" data-testid="coinage"><option value="1"${options.coinage === 1 ? ' selected' : ''}>1 coin / 1 credit</option><option value="2"${options.coinage === 2 ? ' selected' : ''}>1 coin / 2 credits</option></select><label for="free-game">Free game</label><select id="free-game" data-testid="free-game"><option value="enabled"${options.freeGame ? ' selected' : ''}>Enabled</option><option value="disabled"${!options.freeGame ? ' selected' : ''}>Disabled</option></select>`
      : 'bonusCredit' in options
      ? `<label for="bonus-credit">Bonus credit score</label><select id="bonus-credit" data-testid="bonus-credit">${[0, 100, 200, 300, 400, 500, 600, 700, 800].map((score) => `<option value="${score}"${score === options.bonusCredit ? ' selected' : ''}>${score || 'None'}</option>`).join('')}</select><label for="cabinet">Cabinet</label><select id="cabinet" data-testid="cabinet"><option value="normal"${options.cabinet === 'normal' ? ' selected' : ''}>Normal</option><option value="cocktail"${options.cabinet === 'cocktail' ? ' selected' : ''}>Cocktail</option></select><label for="coinage">Coinage</label><select id="coinage" data-testid="coinage"><option value="1"${options.coinage === 1 ? ' selected' : ''}>1 coin / 1 credit</option><option value="2"${options.coinage === 2 ? ' selected' : ''}>1 coin / 2 credits</option></select><label for="balls">Ball count</label><select id="balls" data-testid="balls"><option value="3"${options.balls === 3 ? ' selected' : ''}>3</option><option value="5"${options.balls === 5 ? ' selected' : ''}>5</option></select>`
      : 'winningScore' in options
      ? `<label for="winning-score">Winning score</label><select id="winning-score" data-testid="winning-score"><option value="11"${options.winningScore === 11 ? ' selected' : ''}>11</option><option value="15"${options.winningScore === 15 ? ' selected' : ''}>15</option></select>`
      : `${'coinage' in options ? `<label for="coinage">Coinage</label><select id="coinage" data-testid="coinage"><option value="1"${options.coinage === 1 ? ' selected' : ''}>1 coin / 1 credit</option><option value="2"${options.coinage === 2 ? ' selected' : ''}>1 coin / 2 credits</option></select>` : ''}<label for="playtime">Play time <span data-testid="playtime-value">${(options.playtimeOhms - (controlGameId === 'indy4' ? 220000 : 470000)) / 10000}%</span></label><input id="playtime" data-testid="playtime" type="range" min="0" max="100" step="0.1" value="${(options.playtimeOhms - (controlGameId === 'indy4' ? 220000 : 470000)) / 10000}" aria-label="Play time" /><p class="panel-note">A higher setting allows more time. The original default is 50%.</p>`;
    const running = activeGameId === controlGameId;
    find('[data-testid="apply-game-options"]').hidden = !running;
    find('[data-testid="game-options-status"]').textContent = running
      ? 'Changes are saved for this game. Choose Apply & reset game to use them; this ends the current game.'
      : 'Settings are saved for the next time this game starts.';
  }
  function selectControlGame(gameId: PlayableGameId): void {
    cancelCapture(); options.onCaptureStarted(); controlGameId = gameId;
    find<HTMLSelectElement>('#settings-game').value = gameId;
    renderBindings(); renderMouse(); renderOptions(); bindingMessage.textContent = '';
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
    bindingMessage.textContent = next.kind === 'keyboard' ? `Press a key for ${label(next.action)}. Escape cancels.`
      : next.kind === 'button' ? `Press a controller button for ${label(next.action)}. Escape cancels.`
        : registeredGame(controlGameId) ? `Move the joystick ${registeredGame(controlGameId)!.channels[next.slot].orientation === 'horizontal' ? 'left' : 'up'} for ${gameSpec(controlGameId).controlLabels[next.slot].toLowerCase()}. Escape cancels.`
        : controlGameId === 'stuntcycle' ? 'Move the shared throttle joystick toward idle (negative axis). Escape cancels.' : controlGameId === 'breakout' || controlGameId === 'indy4' ? 'Move the steering joystick left. Escape cancels.' : `Move the joystick up for player ${next.slot + 1}. Escape cancels.`;
  }
  function applyBindings(candidate: Preferences['bindings'], message: string): boolean {
    const result = validateBindings(candidate, controlGameId);
    if (!result.ok) { bindingMessage.textContent = result.errors.join(' '); return false; }
    setPreferences(withGameBindings(preferences, controlGameId, result.bindings));
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
    const candidate = cloneBindings(selectedBindings());
    candidate.keyboard[capture.action] = [event.code];
    applyBindings(candidate, `${label(capture.action)} uses ${keyLabel(event.code)}.`);
    return true;
  }
  function pollCapture(): void {
    if (!capture || capture.kind === 'keyboard') return;
    for (const pad of readPads()) {
      if (!pad?.connected) continue;
      pad.axes.forEach((axis, index) => { if (Math.abs(axis) <= .3) blocked.delete(`a${pad.index}:${index}`); });
      pad.buttons.forEach((button, index) => { if (!button.pressed && button.value <= .5) blocked.delete(`b${pad.index}:${index}`); });
      const candidate = cloneBindings(selectedBindings());
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
        applyBindings(candidate, `${label(action)} controller button assigned.`);
      }
      return;
    }
  }
  function syncGamepads(pads: ConnectedGamepad[]): void {
    find('[data-testid="gamepad-status"]').textContent = typeof navigator.getGamepads !== 'function'
      ? 'Gamepads are unavailable in this browser. Keyboard and mouse controls remain available.' : pads.length
      ? pads.map((pad) => `Controller ${pad.index + 1}: ${pad.id}`).join(' · ')
      : 'No gamepad detected. Connect one and press a button. Keyboard and mouse controls remain available.';
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
    syncRomPlay(); toggleRomBusy(romBusy);
  }
  function syncRomPlay(): void {
    const button = find<HTMLButtonElement>('[data-testid="play-imported"]');
    const game = GAMES.find((game) => game.id === romGame.value);
    button.hidden = !game?.playable;
    button.textContent = `Play ${game?.name ?? 'imported game'}`;
    button.disabled = romBusy || !romReady(romGame.value);
  }
  function romReady(gameId: string): boolean { return entries.some((entry) => entry.gameId === gameId && entry.status === 'ready'); }
  function toggleRomBusy(value: boolean): void {
    romBusy = value;
    romFile.disabled = value;
    romGame.disabled = value;
    remember.disabled = value;
    syncRomPlay();
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
      if (result.ok) options.onRomRemoved(gameId);
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
    else if (button.dataset.bindAxis) beginCapture({ kind: 'axis', slot: Number(button.dataset.bindAxis)  });
    else if (button.dataset.removeRom) void removeRom(button.dataset.removeRom);
    else if (button.dataset.exportRom) void exportRom(button.dataset.exportRom);
  });
  find('#gamepad-players').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const slot = Number(input.dataset.slot) ;
    const property = input.dataset.playerSetting;
    if (!property || !Number.isInteger(slot) || slot < 0 || slot >= gameSpec(controlGameId).controlSlotCount) return;
    const candidate = cloneBindings(selectedBindings());
    if (property === 'invert') candidate.gamepad.players[slot].invert = (input as HTMLInputElement).checked;
    else if (property === 'pad' || property === 'axis') candidate.gamepad.players[slot][property] = Number(input.value);
    else if (property === 'deadzone') candidate.gamepad.players[slot].deadzone = Number(input.value) / 100;
    if (!applyBindings(candidate, 'Controller settings saved.')) renderBindings();
  });
  find<HTMLSelectElement>('#settings-game').addEventListener('change', (event) => {
    const gameId = (event.target as HTMLSelectElement).value;
    if (isPlayableGameId(gameId)) selectControlGame(gameId);
  });
  find('#game-options').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const current = preferences.optionsByGame[controlGameId];
    const registered = registeredGame(controlGameId);
    if (registered) {
      const setting = registered.settings.find((candidate) => candidate.key === input.dataset.option);
      if (!setting) return;
      const value = setting.kind === 'select' ? Number(input.value)
        : Math.round(setting.minOhms + Number(input.value) * (setting.maxOhms - setting.minOhms) / 100);
      const next = normalizeGameOptions(controlGameId, { ...current, [setting.key]: value }) as unknown as RegisteredOptions;
      setPreferences({ ...preferences, optionsByGame: { ...preferences.optionsByGame, [controlGameId]: next } });
      if (setting.kind === 'percent') find('[data-testid="playtime-value"]').textContent = `${(next[setting.key] - setting.minOhms) / ((setting.maxOhms - setting.minOhms) / 100)}%`;
      return;
    }
    const changed = input.id === 'misses' ? { ...current, misses: Number(input.value) }
      : input.id === 'free-game-score' ? { ...current, freeGameScore: Number(input.value) }
      : input.id === 'free-game' ? { ...current, freeGame: input.value === 'enabled' }
      : input.id === 'bonus-credit' ? { ...current, bonusCredit: Number(input.value) }
      : input.id === 'cabinet' ? { ...current, cabinet: input.value }
        : input.id === 'balls' ? { ...current, balls: Number(input.value) }
          : input.id === 'winning-score' ? { ...current, winningScore: Number(input.value) }
      : input.id === 'coinage' ? { ...current, coinage: Number(input.value) }
        : input.id === 'playtime' ? { ...current, playtimeOhms: Math.round((controlGameId === 'indy4' ? 220000 : 470000) + Number(input.value) * 10000) } : current;
    const options = normalizeGameOptions(controlGameId, changed);
    setPreferences({ ...preferences, optionsByGame: { ...preferences.optionsByGame, [controlGameId]: options } });
    if (input.id === 'playtime' && 'playtimeOhms' in options) find('[data-testid="playtime-value"]').textContent = `${(options.playtimeOhms - (controlGameId === 'indy4' ? 220000 : 470000)) / 10000}%`;
  });
  find('#mouse-setting').addEventListener('change', (event) => {
    const input = event.target as HTMLSelectElement;
    if (input.id !== 'mouse-slot' || !isMouseGame(controlGameId)) return;
    setPreferences({ ...preferences, mouseByGame: { ...preferences.mouseByGame, [controlGameId]: input.value === 'off' ? null : Number(input.value) } });
    options.onMouse();
    renderMouse();
  });
  find('[data-testid="apply-game-options"]').addEventListener('click', () => {
    cancelCapture(); options.onApplyGameOptions(controlGameId);
  });
  cancelButton.addEventListener('click', () => cancelCapture());
  find('#controls-defaults').addEventListener('click', () => applyBindings(defaultBindings(controlGameId), 'Default controls restored.'));
  romFile.addEventListener('change', () => { void importRom(); });
  romGame.addEventListener('change', syncRomPlay);
  find('[data-testid="play-imported"]').addEventListener('click', () => {
    if (!romBusy && isPlayableGameId(romGame.value) && romReady(romGame.value)) options.onPlayRom(romGame.value);
  });
  preferencesStatus();
  renderBindings();
  renderMouse();
  renderOptions();
  void refreshRoms();
  if (import.meta.env.DEV) {
    void import('./dev-roms').then(({ importDevRoms }) => importDevRoms(library)).then((count) => {
      if (!count) return;
      romStatus.textContent = `Development server: ${count} local fixture ROM set${count === 1 ? '' : 's'} loaded for this session.`;
      void refreshRoms();
    });
  }
  return {
    get preferences() { return preferences; },
    get capturing() { return !!capture; },
    setVolume: (volume: number) => setPreferences({ ...preferences, volume }),
    setMuted: (muted: boolean) => setPreferences({ ...preferences, muted }),
    setLastGame,
    cancelCapture, handleCaptureKey, pollCapture, syncGamepads, refreshRoms, romDescription, romReady,
    runtimeMembers: library.runtimeMembers,
    showRomError: (message: string) => { romStatus.textContent = message; },
    selectControlGame,
    setActiveGame: (gameId: PlayableGameId | undefined) => { activeGameId = gameId; renderOptions(); },
    bindingsFor: (gameId: PlayableGameId) => gameBindings(preferences, gameId),
    mouseSlotFor: (gameId: PlayableGameId): number | null => isMouseGame(gameId) ? preferences.mouseByGame[gameId] : null,
    selectRomGame: (gameId: string) => { if (GAMES.find((game) => game.id === gameId)?.roms.length) { romGame.value = gameId; syncRomPlay(); } },
  };
}
