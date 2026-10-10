// NoCPU browser frontend, GPL-3.0-or-later. Original DICE circuit engine: DICE Team.
import './style.css';
import { CircuitAudio } from './audio';
import { GAMES, getGame } from './catalog';
import { createShellMarkup, escapeText, gameInfoMarkup } from './shell-ui';
import { createSettingsUI } from './app-settings';
import { createControls } from './controls';
import { ACTION_LABELS, keyLabel } from './control-schema';
import type { CoreCommand, CoreEvent, CoreSnapshot } from './protocol';

const base = import.meta.env.BASE_URL;
const source = `${base}source/nocpu-${__NOCPU_VERSION__}-source.tar.gz`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = createShellMarkup(base, source);

function element<T extends HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
// Artifact promotion updates metadata while keeping the tested runtime bytes intact.
void fetch(`${base}BUILD-MANIFEST.json`, { cache: 'no-store' }).then(async (response) => {
  if (!response.ok) return;
  const manifest: unknown = await response.json();
  if (!manifest || typeof manifest !== 'object') return;
  const metadata = manifest as Record<string, unknown>;
  if (metadata.schema_version !== 1 || metadata.project !== 'NoCPU' || metadata.version !== __NOCPU_VERSION__
    || !['preview', 'release'].includes(String(metadata.stage)) || typeof metadata.buildId !== 'string') return;
  element('#build-id').textContent = metadata.buildId;
  element('#release-stage').hidden = metadata.stage === 'release';
}).catch(() => { /* Local development or offline metadata: retain the preview label. */ });
const playButton = element<HTMLButtonElement>('[data-testid="play-pong"]');
const coinButton = element<HTMLButtonElement>('[data-testid="insert-coin"]');
const pauseButton = element<HTMLButtonElement>('[data-testid="pause"]');
const resetButton = element<HTMLButtonElement>('[data-testid="reset"]');
const resumeButton = element<HTMLButtonElement>('#resume');
const backButton = element<HTMLButtonElement>('#back');
const muteButton = element<HTMLButtonElement>('[data-testid="mute"]');
const status = element('[data-testid="status"]');
const overlay = element('#screen-overlay');
const overlayLabel = element('#overlay-label');
const canvas = element<HTMLCanvasElement>('[data-testid="game-canvas"]');
const shell = element('.game-shell');
const gameStage = element('.game-stage');
const hud = element('.game-hud');
const context = canvas.getContext('2d', { alpha: false });
const pads = [element('[data-testid="paddle-p1"]'), element('[data-testid="paddle-p2"]')];
const audio = new CircuitAudio(() => pauseGame('Sound interrupted — tap Resume.'));
const AXIS_MIN = -32768;
const AXIS_MAX = 32767;
const SEED = 848;
const pointers = new Map<number, number>();
let axes: [number, number] = [0, 0];
let worker: Worker | undefined;
let ready = false;
let paused = false;
let failed = false;
let framePending = false;
let latestPixels: ArrayBuffer | undefined;
let clockEpoch = 0;
let inputRevision = 0;
let axisRevisions: [number, number] = [0, 0];
let resetting = false;
let resetId = 0;
let muted = false;
let soundAvailable = false;
let soundAttempt = 0;
let sampleRate = 48000;
let lastSnapshot: CoreSnapshot | undefined;
let generation = 0;
let snapshotId = 0;
let loadTimeout: ReturnType<typeof setTimeout> | undefined;
let generatedSamples = 0;
let workerTimeMs = 0;
let workerSteps = 0;
let workerMaxMs = 0;
type Screen = 'title' | 'library' | 'game-info' | 'loading' | 'playing' | 'paused' | 'settings' | 'help' | 'about' | 'error';
let screen: Screen = 'title';
let selectedGameId = 'pong';
let helpGameId = 'pong';
const navigation: { screen: Screen; focus?: HTMLElement; scrollTop?: number }[] = [];
const pausedMenuButtons = new Map<string, { armed: boolean; pressed: boolean }>();
const snapshotRequests = new Map<number, { resolve: (snapshot: CoreSnapshot) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
const settingsUI = createSettingsUI({
  onPreferences: (preferences) => {
    muted = preferences.muted;
    audio.setMuted(muted);
    audio.setVolume(preferences.volume);
    updateSoundButton();
  },
  onBindings: (preferences) => { releaseInputs(); controls.setBindings(preferences.bindings); renderHelp(); },
  onCaptureStarted: releaseInputs,
  onMetadataChanged: () => { renderGameInfo(true); },
});
const controls = createControls({
  bindings: settingsUI.preferences.bindings,
  onDirections: (directions) => { if (ready && !paused && !resetting) send({ type: 'keys', directions }); },
  onAxes: (changes) => {
    if (!ready || paused || resetting || failed) return;
    changes.forEach((axis, slot) => {
      if (axis === null || [...pointers.values()].includes(slot)) return;
      axes[slot] = axis;
      sendInputs(slot);
    });
    updatePads();
  },
  onAction: (action) => {
    if (!ready || failed || resetting || screen !== 'playing') return;
    if (action === 'coin') insertCoin();
    else if (action === 'menu') pauseGame();
    else if (action === 'reset') resetGame();
    else if (action === 'mute') muteButton.click();
  },
  onGamepads: settingsUI.syncGamepads,
  onDisconnect: releaseInputs,
});
muted = settingsUI.preferences.muted;
audio.setMuted(muted);
audio.setVolume(settingsUI.preferences.volume);
element<HTMLInputElement>('#volume').value = String(Math.round(settingsUI.preferences.volume * 100));
settingsUI.syncGamepads([]);

function focusGame(): void { canvas.focus({ preventScroll: true }); }

function showScreen(next: Screen): void {
  screen = next;
  shell.dataset.screen = next;
  const playing = next === 'playing';
  overlay.hidden = playing;
  hud.hidden = !playing;
  gameStage.inert = !playing;
  controls.setEnabled(playing && ready && !resetting && !failed);
  pausedMenuButtons.clear();
  element('.overlay-card').scrollTop = 0;
  backButton.hidden = !['library', 'game-info', 'settings', 'help', 'about'].includes(next);
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== next;
  });
  if (playing) focusGame();
  else {
    overlay.setAttribute('aria-labelledby', `${next}-heading`);
    const panel = element<HTMLElement>(`[data-panel="${next}"]`);
    panel.tabIndex = -1;
    const focusTarget = (next === 'library' ? panel.querySelector<HTMLElement>('.library-game') : undefined)
      ?? panel.querySelector<HTMLElement>('button:not(:disabled), a, input:not(:disabled), select') ?? panel;
    focusTarget.focus({ preventScroll: true });
  }
}

function openPanel(panel: 'library' | 'game-info' | 'settings' | 'help' | 'about'): void {
  if (screen === 'playing') pauseGame();
  settingsUI.cancelCapture();
  navigation.push({ screen, focus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
    scrollTop: element('.overlay-card').scrollTop });
  if (panel === 'settings') void settingsUI.refreshRoms();
  if (panel === 'help') renderHelp();
  showScreen(panel);
}

function closePanel(): void {
  settingsUI.cancelCapture();
  const origin = navigation.pop() ?? { screen: ready ? 'paused' : 'title' };
  showScreen(origin.screen);
  element('.overlay-card').scrollTop = origin.scrollTop ?? 0;
  if (origin.focus?.isConnected && !origin.focus.closest('[hidden]')) origin.focus.focus({ preventScroll: true });
}

function renderGameInfo(metadataOnly = false): void {
  const game = getGame(selectedGameId);
  const content = element('#game-info-content');
  if (metadataOnly && content.dataset.gameId === game.id) {
    element('[data-testid="game-rom-status"]').textContent = settingsUI.romDescription(game.id);
    return;
  }
  element('#game-info-heading').textContent = game.name;
  content.innerHTML = gameInfoMarkup(game, settingsUI.romDescription(game.id));
  content.dataset.gameId = game.id;
  const play = element<HTMLButtonElement>('[data-testid="play-selected"]');
  play.disabled = !game.playable;
  play.textContent = game.playable ? `Play ${game.name}` : 'Browser port pending';
  element('#manage-game-roms').hidden = !game.roms.length;
}

function renderHelp(): void {
  const game = getGame(helpGameId);
  const actions = game.controlSchema.keyboardActions;
  canvas.setAttribute('aria-label', `Pong game display. Player 1 uses ${settingsUI.preferences.bindings.keyboard.p1Up.map(keyLabel).join(' / ')} and ${settingsUI.preferences.bindings.keyboard.p1Down.map(keyLabel).join(' / ')}; player 2 uses ${settingsUI.preferences.bindings.keyboard.p2Up.map(keyLabel).join(' / ')} and ${settingsUI.preferences.bindings.keyboard.p2Down.map(keyLabel).join(' / ')}. On touchscreens use the separate P1 and P2 sliders outside the court.`);
  const gamepadHelp = `<h2>Current gamepad controls</h2><ul>${settingsUI.preferences.bindings.gamepad.players.map((player, slot) => `<li>Player ${slot + 1}: controller ${player.pad + 1}, axis ${player.axis + 1}${player.invert ? ' reversed' : ''}; ${Math.round(player.deadzone * 100)}% deadzone.</li>`).join('')}</ul><dl class="controls-help">${actions.map((action) => `<div><dt>${escapeText(ACTION_LABELS[action])}</dt><dd>${settingsUI.preferences.bindings.gamepad.buttons[action].map((binding) => `Controller ${binding.pad + 1} · button ${binding.button + 1}`).join(' / ') || 'Unassigned'}</dd></div>`).join('')}</dl><p>A moved joystick sets paddle height. A centered joystick leaves the last position alone. Direction buttons move the paddle up or down.</p>`;
  element('#help-heading').textContent = game.playable ? 'How to play' : `${game.name} controls`;
  element('#game-help-content').innerHTML = game.playable
    ? `<p>Insert a coin to start a two-player game. Return the ball with your paddle. First to 11 wins.</p><dl class="controls-help">${actions.map((action) => `<div><dt>${escapeText(ACTION_LABELS[action])}</dt><dd>${settingsUI.preferences.bindings.keyboard[action].map((code) => `<kbd>${escapeText(keyLabel(code))}</kbd>`).join(' ') || 'Unassigned'}</dd></div>`).join('')}</dl><p>Drag the separate P1 and P2 sliders outside the court. Both players can move at once, without covering the ball.</p>${gamepadHelp}<p>Keyboard and gamepad assignments can be changed in Settings. Escape opens the menu or goes back.</p>`
    : `<p>${escapeText(game.name)} uses ${game.controlFamilies.map(escapeText).join(', ').toLowerCase()} controls in DICE.</p><ul>${game.controlSchema.controls.map((control) => `<li>${escapeText(control.label)}</li>`).join('')}</ul><p>Its browser port is pending. Browser controls and touch layouts will be available with that port.</p>`;
}

function focusSettingsSection(id: string): void {
  settingsUI.cancelCapture();
  const heading = element(`#${id} h2`);
  heading.scrollIntoView({ block: 'start', behavior: 'auto' });
  heading.focus({ preventScroll: true });
}

function updateFullscreen(message?: string): void {
  const button = element<HTMLButtonElement>('[data-testid="fullscreen"]');
  const available = typeof shell.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
  button.disabled = !available;
  button.textContent = document.fullscreenElement ? 'Exit fullscreen' : available ? 'Enter fullscreen' : 'Fullscreen unavailable';
  element('[data-testid="fullscreen-status"]').textContent = message ?? (document.fullscreenElement
    ? 'Fullscreen active.' : available ? 'Normal browser view works without fullscreen.'
      : 'Fullscreen is unavailable in this browser. Normal browser view remains available.');
}

async function toggleFullscreen(): Promise<void> {
  releaseInputs();
  settingsUI.cancelCapture();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await shell.requestFullscreen();
    updateFullscreen();
  } catch { updateFullscreen('Fullscreen could not start. Normal browser view remains available.'); }
}

function send(command: CoreCommand): void { worker?.postMessage(command); }
function sendInputs(slot?: number): void {
  if (!ready) return;
  const revision = ++inputRevision;
  const changes: [number | null, number | null] = [null, null];
  for (let index = 0; index < 2; index += 1) {
    if (slot === undefined || slot === index) { changes[index] = axes[index]; axisRevisions[index] = revision; }
  }
  send({ type: 'inputs', axes: changes, revision });
}
function setClock(running: boolean): void {
  clockEpoch += 1;
  framePending = false;
  latestPixels = undefined;
  send({ type: 'clock', running, epoch: clockEpoch });
}

function updateSoundButton(): void {
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.textContent = muted ? 'Sound off' : soundAvailable ? 'Sound on' : 'Enable sound';
  muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : soundAvailable ? 'Mute sound' : 'Enable sound');
}

async function trySound(): Promise<void> {
  const attempt = ++soundAttempt;
  const ownGeneration = generation;
  const audible = await audio.unlock();
  if (attempt !== soundAttempt || ownGeneration !== generation || failed || document.hidden) return;
  soundAvailable = audible;
  element('#sound-note').hidden = audible;
  updateSoundButton();
}

function updatePads(): void {
  pads.forEach((pad, slot) => {
    const fraction = (axes[slot] - AXIS_MIN) / (AXIS_MAX - AXIS_MIN);
    pad.style.setProperty('--paddle-position', `${fraction * 100}%`);
    pad.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    pad.setAttribute('aria-disabled', String(!ready || paused || resetting || failed));
    pad.tabIndex = ready && !paused && !resetting && !failed ? 0 : -1;
  });
}

function releaseInputs(): void {
  controls.release();
  pausedMenuButtons.clear();
  for (const [id, slot] of pointers) if (pads[slot].hasPointerCapture(id)) pads[slot].releasePointerCapture(id);
  pointers.clear();
  pads.forEach((pad) => pad.classList.remove('active'));
  if (ready) send({ type: 'release' });
}

function showStatus(message?: string): void {
  if (message) { status.textContent = message; return; }
  status.textContent = paused ? 'Paused — tap Resume.' : !ready ? 'Loading Pong…' : lastSnapshot?.run ? 'Game on' : 'Insert a coin to play';
}

function pauseGame(message?: string): void {
  soundAttempt += 1;
  if (!ready || failed) return;
  paused = true;
  setClock(false);
  releaseInputs();
  audio.pause();
  pauseButton.setAttribute('aria-pressed', 'true');
  if (!['library', 'game-info', 'settings', 'help', 'about'].includes(screen)) showScreen('paused');
  updatePads();
  showStatus(message);
}

function resumeGame(userGesture = true): void {
  if (!ready || failed || document.hidden) return;
  // Unlock from this gesture without making play depend on an audio device.
  if (userGesture || audio.metrics().contextState === 'running') void trySound();
  paused = false;
  setClock(true);
  pauseButton.setAttribute('aria-pressed', 'false');
  showScreen('playing');
  updatePads();
  showStatus();
}

function failGame(message: string): void {
  soundAttempt += 1;
  failed = true;
  ready = false;
  releaseInputs();
  audio.pause();
  worker?.terminate();
  worker = undefined;
  if (loadTimeout) clearTimeout(loadTimeout);
  for (const request of snapshotRequests.values()) { clearTimeout(request.timeout); request.reject(new Error(message)); }
  snapshotRequests.clear();
  coinButton.disabled = true;
  pauseButton.disabled = true;
  resetButton.disabled = true;
  element('#error-message').textContent = message;
  showScreen('error');
  updatePads();
  showStatus('Pong could not load');
}

function acceptSnapshot(snapshot: CoreSnapshot): void {
  lastSnapshot = snapshot;
  snapshot.axes.forEach((axis, slot) => {
    if (snapshot.inputRevision >= axisRevisions[slot]) axes[slot] = axis;
  });
  updatePads();
  element('[data-testid="score-p1"]').textContent = String(snapshot.scores[0]);
  element('[data-testid="score-p2"]').textContent = String(snapshot.scores[1]);
  showStatus();
}

async function startGame(): Promise<void> {
  selectedGameId = 'pong';
  helpGameId = 'pong';
  navigation.length = 0;
  settingsUI.cancelCapture();
  generation += 1;
  soundAttempt += 1;
  const ownGeneration = generation;
  worker?.terminate();
  ready = false;
  failed = false;
  paused = false;
  framePending = false;
  resetting = false;
  axes = [0, 0];
  releaseInputs();
  latestPixels = undefined;
  inputRevision = 0;
  axisRevisions = [0, 0];
  generatedSamples = 0;
  workerTimeMs = 0;
  workerSteps = 0;
  workerMaxMs = 0;
  lastSnapshot = undefined;
  audio.pause();
  soundAvailable = false;
  updateSoundButton();
  updatePads();
  showScreen('loading');
  overlayLabel.textContent = 'Loading Pong…';
  showStatus();
  coinButton.disabled = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute('aria-pressed', 'false');
  resetButton.disabled = true;
  element('[data-testid="score-p1"]').textContent = '0';
  element('[data-testid="score-p2"]').textContent = '0';
  if (!context || typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
    failGame('This browser cannot run Pong. Try a recent version of Chrome, Firefox, Edge or Safari.');
    return;
  }
  // This call happens directly within the player's gesture, before loading awaits.
  void trySound();
  worker = new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('error', () => { if (generation === ownGeneration) failGame('Pong could not load. Check your connection and reload the game.'); });
  worker.addEventListener('message', (event: MessageEvent<CoreEvent>) => {
    if (generation !== ownGeneration || failed) return;
    const message = event.data;
    switch (message.type) {
      case 'ready':
        if (loadTimeout) clearTimeout(loadTimeout);
        canvas.width = message.width;
        canvas.height = message.height;
        sampleRate = message.sampleRate;
        ready = true;
        coinButton.disabled = false;
        pauseButton.disabled = false;
        resetButton.disabled = false;
        updatePads();
        acceptSnapshot(message.snapshot);
        if (document.hidden || !document.hasFocus()) pauseGame();
        else { setClock(true); showScreen('playing'); }
        break;
      case 'output':
        if (message.epoch !== clockEpoch || paused || resetting) break;
        generatedSamples += message.audio.byteLength / 2;
        workerTimeMs += message.elapsed;
        workerSteps += 1;
        workerMaxMs = Math.max(workerMaxMs, message.elapsed);
        if (message.audioDiscontinuity) audio.clear();
        audio.push(new Int16Array(message.audio), sampleRate);
        acceptSnapshot(message.snapshot);
        send({ type: 'ack', epoch: message.epoch, sequence: message.sequence });
        break;
      case 'frame':
        if (message.epoch !== clockEpoch) break;
        framePending = false;
        if (!paused && !resetting && message.pixels) latestPixels = message.pixels;
        break;
      case 'reset':
        if (message.id !== resetId) break;
        resetting = false;
        framePending = false;
        latestPixels = undefined;
        updatePads();
        acceptSnapshot(message.snapshot);
        controls.setEnabled(!paused && screen === 'playing' && !document.hidden);
        break;
      case 'snapshot': {
        const request = snapshotRequests.get(message.id);
        if (request) { clearTimeout(request.timeout); snapshotRequests.delete(message.id); request.resolve(message.snapshot); }
        break;
      }
      case 'error': failGame(message.message); break;
    }
  });
  const moduleUrl = new URL(`${base}core/nocpu.js`, document.baseURI).href;
  send({ type: 'init', moduleUrl, seed: SEED });
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = setTimeout(() => { if (generation === ownGeneration && !ready) failGame('Pong is taking too long to load. Check your connection and reload the game.'); }, 30000);
}

function insertCoin(): void {
  if (!ready || failed || resetting) return;
  // Original hardware needs an initial settled interval; the first press is retained.
  if (paused) resumeGame();
  else void trySound();
  send({ type: 'coin' });
  focusGame();
}

function resetGame(): void {
  if (!ready || failed) return;
  releaseInputs();
  axes = [0, 0];
  updatePads();
  audio.clear();
  resetting = true;
  controls.setEnabled(false);
  updatePads();
  clockEpoch += 1;
  framePending = false;
  latestPixels = undefined;
  send({ type: 'reset', id: ++resetId, seed: SEED, epoch: clockEpoch, running: !paused && !document.hidden });
}

function disposeGame(destination: 'title' | 'library'): void {
  generation += 1;
  soundAttempt += 1;
  releaseInputs();
  audio.pause();
  worker?.terminate();
  worker = undefined;
  if (loadTimeout) clearTimeout(loadTimeout);
  for (const request of snapshotRequests.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error('Returned to title.'));
  }
  snapshotRequests.clear();
  ready = false;
  paused = false;
  resetting = false;
  failed = false;
  framePending = false;
  latestPixels = undefined;
  lastSnapshot = undefined;
  axes = [0, 0];
  soundAvailable = false;
  coinButton.disabled = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute('aria-pressed', 'false');
  resetButton.disabled = true;
  updatePads();
  updateSoundButton();
  status.textContent = 'Choose Play Pong to start.';
  context?.clearRect(0, 0, canvas.width, canvas.height);
  navigation.length = 0;
  if (destination === 'library') navigation.push({ screen: 'title', focus: element('[data-testid="open-library"]') });
  showScreen(destination);
  if (destination === 'library') element(`[data-game-id="${selectedGameId}"]`).focus({ preventScroll: true });
}
function returnToTitle(): void { disposeGame('title'); }
function returnToLibrary(): void { disposeGame('library'); }

function pollPausedMenu(): void {
  if (screen !== 'paused' || !ready || resetting || failed) return;
  if (document.hidden || !document.hasFocus()) { pausedMenuButtons.clear(); return; }
  const present = new Set<string>();
  let activate = false;
  try {
    const pads = navigator.getGamepads?.() ?? [];
    for (const binding of settingsUI.preferences.bindings.gamepad.buttons.menu) {
      const pad = pads[binding.pad];
      if (!pad?.connected) continue;
      const button = pad.buttons[binding.button];
      if (!button) continue;
      const key = `${pad.index}:${pad.id}:${binding.button}`;
      present.add(key);
      const down = button.pressed || button.value > .5;
      const previous = pausedMenuButtons.get(key) ?? { armed: false, pressed: false };
      if (!down) previous.armed = true;
      else if (previous.armed && !previous.pressed) activate = true;
      previous.pressed = down;
      pausedMenuButtons.set(key, previous);
    }
  } catch { pausedMenuButtons.clear(); return; }
  for (const key of pausedMenuButtons.keys()) if (!present.has(key)) pausedMenuButtons.delete(key);
  if (activate) resumeGame(false);
}

function animationFrame(): void {
  controls.pollGamepads();
  settingsUI.pollCapture();
  pollPausedMenu();
  if (ready && !paused && !failed && !resetting && !document.hidden) {
    if (latestPixels) {
      context!.putImageData(new ImageData(new Uint8ClampedArray(latestPixels), canvas.width, canvas.height), 0, 0);
      latestPixels = undefined;
    }
    // Presentation pulls the newest completed circuit image. Its cadence never
    // drives simulation or PCM; one pending frame request bounds large copies.
    if (!framePending) {
      framePending = true;
      send({ type: 'frame', epoch: clockEpoch });
    }
  }
  requestAnimationFrame(animationFrame);
}

pads.forEach((pad, slot) => {
  const track = pad.querySelector<HTMLElement>('.control-track')!;
  function move(event: PointerEvent): void {
    if (pointers.get(event.pointerId) !== slot) return;
    // Labels and target padding are outside the visible thumb's travel. Map
    // against that exact track so its endpoints represent the full input range.
    const bounds = track.getBoundingClientRect();
    if (bounds.height <= 0) return;
    const fraction = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    axes[slot] = Math.round(AXIS_MIN + fraction * (AXIS_MAX - AXIS_MIN));
    updatePads();
    sendInputs(slot);
  }
  pad.addEventListener('pointerdown', (event) => {
    if (!ready || paused || failed || resetting || [...pointers.values()].includes(slot)) return;
    event.preventDefault();
    pointers.set(event.pointerId, slot);
    pad.setPointerCapture(event.pointerId);
    pad.classList.add('active');
    move(event);
  });
  pad.addEventListener('pointermove', move);
  const release = (event: PointerEvent): void => {
    if (pointers.get(event.pointerId) !== slot) return;
    pointers.delete(event.pointerId);
    pad.classList.remove('active');
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  pad.addEventListener('lostpointercapture', release);
  pad.addEventListener('keydown', (event) => {
    if (!ready || paused || failed || resetting || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Home') axes[slot] = AXIS_MIN;
    else if (event.code === 'End') axes[slot] = AXIS_MAX;
    else axes[slot] = Math.max(AXIS_MIN, Math.min(AXIS_MAX, axes[slot] + (event.code === 'ArrowUp' ? -2048 : 2048)));
    updatePads();
    sendInputs(slot);
  });
});

document.addEventListener('keydown', (event) => {
  if (settingsUI.handleCaptureKey(event)) return;
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target as HTMLElement | null;
  if (event.code === 'Escape' && !event.repeat) {
    if (['library', 'game-info', 'settings', 'help', 'about'].includes(screen)) { event.preventDefault(); closePanel(); }
    else if (ready && !failed) { event.preventDefault(); if (paused) resumeGame(); else pauseGame(); }
    return;
  }
  if (!ready || failed || target?.matches('input, textarea, select') || target?.isContentEditable) return;
  // Native button activation remains available in game menus and after a click.
  if (target?.closest('button') && ['Space', 'Enter'].includes(event.code)) return;
  if (screen === 'paused') {
    if (!event.repeat && settingsUI.preferences.bindings.keyboard.menu.includes(event.code)) {
      event.preventDefault(); resumeGame();
    }
    return;
  }
  if (screen !== 'playing' || resetting) return;
  controls.handleKeyDown(event);
});
overlay.addEventListener('keydown', (event) => {
  if (event.code !== 'Tab') return;
  const controls = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary')]
    .filter((control) => !control.closest<HTMLElement>('[hidden]'));
  if (!controls.length) { event.preventDefault(); return; }
  const index = controls.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)!.focus(); }
  else if (!event.shiftKey && (index === -1 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
});
document.addEventListener('keyup', (event) => { controls.handleKeyUp(event); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { settingsUI.cancelCapture(); pauseGame('Paused while you were away.'); releaseInputs(); } });
window.addEventListener('blur', () => { settingsUI.cancelCapture(); pauseGame('Paused while you were away.'); releaseInputs(); });
window.addEventListener('resize', () => {
  // A captured touch belongs to the old control geometry. Require a fresh
  // contact after rotation/viewport resizing instead of moving the paddle.
  if (pointers.size) releaseInputs();
});
window.addEventListener('pagehide', () => { pauseGame('Paused while you were away.'); releaseInputs(); audio.pause(); });
playButton.addEventListener('click', () => { void startGame(); });
element('#retry').addEventListener('click', () => { void startGame(); });
coinButton.addEventListener('click', insertCoin);
pauseButton.addEventListener('click', () => { if (paused) void resumeGame(); else pauseGame(); });
resumeButton.addEventListener('click', () => resumeGame());
backButton.addEventListener('click', closePanel);
element('#return-title').addEventListener('click', returnToTitle);
element('#return-library').addEventListener('click', returnToLibrary);
element('[data-testid="play-selected"]').addEventListener('click', () => { if (getGame(selectedGameId).playable) void startGame(); });
element('.library-list').addEventListener('click', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-game-id]');
  if (!item) return;
  item.focus({ preventScroll: true });
  selectedGameId = item.dataset.gameId!;
  renderGameInfo();
  openPanel('game-info');
});
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    button.focus({ preventScroll: true });
    const action = button.dataset.action;
    if (action === 'title') returnToTitle();
    else if (action === 'library') openPanel('library');
    else if (action === 'manage-roms') {
      settingsUI.selectRomGame(selectedGameId); openPanel('settings'); focusSettingsSection('rom-section');
    } else if (action === 'game-help') { helpGameId = selectedGameId; openPanel('help'); }
    else if (action === 'settings' || action === 'help' || action === 'about') {
      if (action === 'help') helpGameId = 'pong';
      openPanel(action);
    }
  });
});
resetButton.addEventListener('click', resetGame);
muteButton.addEventListener('click', () => {
  if (!muted && !soundAvailable) { void trySound(); return; }
  muted = !muted;
  settingsUI.setMuted(muted);
  if (!muted) void trySound();
});
element<HTMLInputElement>('#volume').addEventListener('input', (event) => { settingsUI.setVolume(Number((event.target as HTMLInputElement).value) / 100); });
document.querySelectorAll<HTMLButtonElement>('[data-settings-target]').forEach((button) => {
  button.addEventListener('click', () => focusSettingsSection(button.dataset.settingsTarget!));
});
element('[data-testid="fullscreen"]').addEventListener('click', () => { void toggleFullscreen(); });
document.addEventListener('fullscreenchange', () => { releaseInputs(); updateFullscreen(); });
document.addEventListener('fullscreenerror', () => updateFullscreen('Fullscreen could not start. Normal browser view remains available.'));
renderGameInfo();
renderHelp();
updateSoundButton();
updateFullscreen();
showScreen('title');
requestAnimationFrame(animationFrame);

if (new URLSearchParams(location.search).has('debug')) {
  const debugWindow = window as unknown as { __nocpuDebug: { snapshot: () => Promise<unknown> } };
  debugWindow.__nocpuDebug = {
    snapshot: async () => {
      if (!ready || !worker) throw new Error('Pong is not ready.');
      const id = ++snapshotId;
      const state = await new Promise<CoreSnapshot>((resolve, reject) => {
        const timeout = setTimeout(() => { snapshotRequests.delete(id); reject(new Error('Pong did not answer.')); }, 5000);
        snapshotRequests.set(id, { resolve, reject, timeout });
        send({ type: 'snapshot', id });
      });
      return {
        timePs: state.timeps, frame: state.frame, hits: state.hits, scores: state.scores,
        runN: Number(!state.run), attractN: Number(!state.attract),
        inputs: { coin: Number(state.coin), paddle1: state.axes[0], paddle2: state.axes[1] },
        heldKeys: controls.getState().heldKeys, pointerCount: pointers.size, paused, screen, selectedGame: selectedGameId,
        audio: { generatedSamples, coreOverruns: state.audioOverruns, transportDroppedSamples: state.audioTransportDroppedSamples, ...audio.metrics() },
        worker: { simulatedUs: Number(BigInt(state.timeps) / 1000000n), steps: workerSteps, totalMs: workerTimeMs, maxMs: workerMaxMs,
          wasmMemoryCapacityBytes: state.wasmMemoryCapacityBytes },
      };
    },
  };
}
