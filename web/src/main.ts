// NoCPU browser frontend, GPL-3.0-or-later. Original DICE circuit engine: DICE Team.
import './style.css';
import { CircuitAudio } from './audio';
import { GAMES, getGame } from './catalog';
import { createShellMarkup, escapeText, gameInfoMarkup } from './shell-ui';
import { createSettingsUI } from './app-settings';
import { createControls } from './controls';
import { actionLabel, directionAction, keyLabel } from './control-schema';
import { createCoreAssetUrls } from './asset-identity';
import { observeHomeScreenDisplay, syncHomeScreenGuidance } from './home-screen';
import { annotateQualificationReport, createQualificationRecorder, type QualificationMetadata, type QualificationReport, type QualificationSnapshot } from './qualification';
import { canonicalPaddleAxis, displayPaddleAxis, gameSpec, isPlayableGameId, type PlayableGameId } from './game-contract';
import type { CoreCommand, CoreEvent, CoreSnapshot } from './protocol';

const base = import.meta.env.BASE_URL;
const coreAssetUrls = createCoreAssetUrls(new URL(base, document.baseURI).href, __NOCPU_CORE_JS_SHA256__, __NOCPU_CORE_WASM_SHA256__);
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
const startButton = element<HTMLButtonElement>('[data-testid="start-game"]');
const start2Button = element<HTMLButtonElement>('[data-testid="start-game-2"]');
const serveButton = element<HTMLButtonElement>('[data-testid="serve-game"]');
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
const pads = [1, 2, 3, 4].map((slot) => element(`[data-testid="paddle-p${slot}"]`));
const audio = new CircuitAudio(() => pauseGame('Sound interrupted — tap Resume.'));
const AXIS_MIN = -32768;
const AXIS_MAX = 32767;
const SEED = 848;
const pointers = new Map<number, number>();
let axes: number[] = [0, 0];
const releaseDirectionActivation: (() => void)[] = [];
const directionPointers = new Map<number, { slot: number; direction: 'up' | 'down'; target: HTMLElement }>();
const servePointers = new Set<number>();
let worker: Worker | undefined;
let ready = false;
let paused = false;
let failed = false;
let framePending = false;
let latestPixels: ArrayBuffer | undefined;
let clockEpoch = 0;
let inputRevision = 0;
let axisRevisions: number[] = [0, 0];
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
let qualificationBoundary: ((reason: string) => void) | undefined;
type Screen = 'title' | 'library' | 'game-info' | 'loading' | 'playing' | 'paused' | 'settings' | 'help' | 'about' | 'error' | 'qualification';
let screen: Screen = 'title';
let selectedGameId = 'pong';
let activeGameId: PlayableGameId = 'pong';
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
  onBindings: () => { releaseInputs(); controls.setBindings(settingsUI.bindingsFor(activeGameId)); renderHelp(); },
  onCaptureStarted: releaseInputs,
  onMetadataChanged: () => { renderGameInfo(true); },
  onApplyGameOptions: (gameId) => { if (ready && gameId === activeGameId) resetGame(); },
});
const controls = createControls({
  bindings: settingsUI.preferences.bindings,
  onDirections: (directions) => { if (ready && !paused && !resetting) send({ type: 'keys', directions }); },
  onAxes: (changes) => {
    if (!ready || paused || resetting || failed) return;
    changes.forEach((axis, slot) => {
      if (axis === null || [...pointers.values()].includes(slot)) return;
      axes[slot] = canonicalPaddleAxis(activeGameId, axis);
      sendInputs(slot);
    });
    updatePads();
  },
  onAction: (action) => {
    if (!ready || failed || resetting || screen !== 'playing') return;
    if (action === 'coin') insertCoin();
    else if (action === 'start') startRound();
    else if (action === 'start2') startRound(2);
    else if (action === 'menu') pauseGame();
    else if (action === 'reset') resetGame();
    else if (action === 'mute') muteButton.click();
  },
  onServe: (held) => {
    serveButton.classList.toggle('active', held);
    if (!ready || failed || activeGameId !== 'breakout' || (held && (paused || resetting))) return;
    if (held) qualificationBoundary?.('serve_switch');
    send({ type: 'serve', held });
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
  backButton.hidden = !['library', 'game-info', 'settings', 'help', 'about', 'qualification'].includes(next);
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

function openPanel(panel: 'library' | 'game-info' | 'settings' | 'help' | 'about' | 'qualification'): void {
  if (screen === 'playing') pauseGame();
  settingsUI.cancelCapture();
  navigation.push({ screen, focus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
    scrollTop: element('.overlay-card').scrollTop });
  if (panel === 'settings') {
    settingsUI.selectControlGame(ready ? activeGameId : isPlayableGameId(selectedGameId) ? selectedGameId : 'pong');
    void settingsUI.refreshRoms();
  }
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
  const playingBindings = settingsUI.bindingsFor(activeGameId);
  const playingSpec = gameSpec(activeGameId);
  canvas.setAttribute('aria-label', `${playingSpec.title} game display. ${playingBindings.gamepad.players.map((_, slot) => `${activeGameId === 'breakout' ? 'The shared paddle' : `Player ${slot + 1}`} uses ${playingBindings.keyboard[directionAction(slot, 'Up', activeGameId)].map(keyLabel).join(' / ')} and ${playingBindings.keyboard[directionAction(slot, 'Down', activeGameId)].map(keyLabel).join(' / ')} for ${playingSpec.controlLabels[slot].toLowerCase()}.`).join(' ')} On touchscreens use the separate controls outside the court.`);
  element('#help-heading').textContent = game.playable ? `${game.name}: How to play` : `${game.name} controls`;
  if (!isPlayableGameId(game.id)) {
    element('#game-help-content').innerHTML = `<p>${escapeText(game.name)} uses ${game.controlFamilies.map(escapeText).join(', ').toLowerCase()} controls in DICE.</p><ul>${game.controlSchema.controls.map((control) => `<li>${escapeText(control.label)}</li>`).join('')}</ul><p>Its browser port is pending. Browser controls and touch layouts will be available with that port.</p>`;
    return;
  }
  const playableId = game.id;
  const bindings = settingsUI.bindingsFor(game.id);
  const spec = gameSpec(game.id);
  const options = ready && game.id === activeGameId && lastSnapshot ? lastSnapshot.options : settingsUI.preferences.optionsByGame[game.id];
  const rules = game.id === 'pong' ? `Insert a coin to start a two-player game. Return the ball with your paddle. First to ${'winningScore' in options ? options.winningScore : 11} wins.`
    : game.id === 'pongdoubles' ? `Insert one coin for two players or two coins for four players, then press Start. In four-player mode, left and right teams each have an outer and inner paddle. P1 is outer left, P2 outer right, P3 inner left and P4 inner right. First team to ${'winningScore' in options ? options.winningScore : 11} wins.`
      : game.id === 'breakout' ? `Start 1P needs one credit; Start 2P needs two credits. ${'coinage' in options && options.coinage === 2 ? 'One coin supplies two credits with the current setting.' : 'Insert one coin for Start 1P or two coins for Start 2P with the current setting.'} Then hold Serve to launch the ball. Move the shared paddle left or right to break the bricks. Both player starts use the same paddle control.`
        : 'Insert a coin, then press Start. Move your rocket up or down through the moving obstacles. Reach the top to score before time runs out.';
  const touchHelp = game.id === 'spacerace' ? 'Hold the separate Up or Down buttons for your rocket outside the court. Release to stop. Both players can move at once.'
    : game.id === 'pongdoubles' ? 'Drag the four separate sliders outside the court. All four paddles have independent controls. For shared play, use suitable controllers or a larger screen.'
      : game.id === 'breakout' ? 'Drag the horizontal slider outside the court to move the shared paddle. Hold the separate Serve button to launch the ball. Release Serve when the ball is in play.'
        : 'Drag the separate P1 and P2 sliders outside the court. Both players can move at once, without covering the ball.';
  const gamepadHelp = `<h2>Current gamepad controls</h2><ul>${bindings.gamepad.players.map((player, slot) => `<li>${game.id === 'breakout' ? 'Shared paddle' : `Player ${slot + 1} (${escapeText(spec.controlLabels[slot].toLowerCase())})`}: controller ${player.pad + 1}, axis ${player.axis + 1}${player.invert ? ' reversed' : ''}; ${Math.round(player.deadzone * 100)}% deadzone.</li>`).join('')}</ul><dl class="controls-help">${actions.map((action) => `<div><dt>${escapeText(actionLabel(action, playableId))}</dt><dd>${bindings.gamepad.buttons[action].map((binding) => `Controller ${binding.pad + 1} · button ${binding.button + 1}`).join(' / ') || 'Unassigned'}</dd></div>`).join('')}</dl><p>${game.id === 'spacerace' ? 'A moved joystick holds Up or Down. Center it to release. Opposing directions cancel each other.' : game.id === 'breakout' ? 'A moved joystick sets the shared paddle position. A centered joystick leaves the last position alone. Direction buttons move it left or right. Serve is held while its assigned button is down.' : 'A moved joystick sets paddle height. A centered joystick leaves the last position alone. Direction buttons move the paddle up or down.'} Return joysticks and buttons to neutral after a menu, reset or reconnect.</p>`;
  element('#game-help-content').innerHTML = `<p>${rules}</p><dl class="controls-help">${actions.map((action) => `<div><dt>${escapeText(actionLabel(action, playableId))}</dt><dd>${bindings.keyboard[action].map((code) => `<kbd>${escapeText(keyLabel(code))}</kbd>`).join(' ') || 'Unassigned'}</dd></div>`).join('')}</dl><p>${touchHelp}</p>${gamepadHelp}<p>Keyboard and gamepad assignments can be changed for each game in Settings. Game settings take effect when starting or explicitly resetting that game. Escape opens the menu or goes back.</p>`;
}
function configureGameControls(): void {
  const spec = gameSpec(activeGameId);
  gameStage.dataset.game = activeGameId;
  shell.dataset.game = activeGameId;
  gameStage.dataset.inputKind = spec.inputKind;
  pads.forEach((pad, slot) => {
    const controller = pad.closest<HTMLElement>('.paddle-controller')!;
    controller.hidden = slot >= spec.paddleCount;
    pad.setAttribute('aria-label', activeGameId === 'breakout' ? 'Shared paddle position' : activeGameId === 'pong' ? `Player ${slot + 1} paddle position` : `Player ${slot + 1} ${spec.controlLabels[slot] ?? 'paddle'} position`);
    pad.setAttribute('aria-orientation', spec.paddleOrientation);
    element(`#paddle-p${slot + 1}-label`).textContent = activeGameId === 'pongdoubles'
      ? `P${slot + 1} · ${slot < 2 ? 'OUTER' : 'INNER'}` : activeGameId === 'breakout' ? 'SHARED PADDLE' : `P${slot + 1}`;
    element(`#paddle-p${slot + 1}-help`).textContent = spec.paddleOrientation === 'horizontal' ? 'DRAG LEFT / RIGHT' : 'DRAG UP / DOWN';
  });
  document.querySelectorAll<HTMLElement>('.direction-controller').forEach((controller) => { controller.hidden = spec.inputKind !== 'joystick'; });
  startButton.hidden = !spec.hasStart;
  startButton.textContent = activeGameId === 'breakout' ? 'Start 1P' : 'Start';
  startButton.setAttribute('aria-label', activeGameId === 'breakout' ? 'Start 1-player game' : 'Start game');
  start2Button.hidden = spec.startButtons < 2;
  serveButton.closest<HTMLElement>('.serve-controller')!.hidden = !spec.hasServe;
  coinButton.textContent = activeGameId === 'breakout' ? 'Coin' : 'Insert coin';
  coinButton.setAttribute('aria-label', 'Insert coin');
  element('#loading-heading').textContent = `Loading ${spec.title}`;
  element('#error-heading').textContent = `Unable to load ${spec.title}`;
  hud.setAttribute('aria-label', `${spec.title} game actions`);
  renderHelp();
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
  const changes: (number | null)[] = Array(axes.length).fill(null);
  for (let index = 0; index < axes.length; index += 1) {
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
  start2Button.disabled = !ready || resetting || failed;
  serveButton.disabled = !ready || paused || resetting || failed || !gameSpec(activeGameId).hasServe;
  document.querySelectorAll<HTMLButtonElement>('.direction-button').forEach((button) => { button.disabled = !ready || paused || resetting || failed || activeGameId !== 'spacerace'; });
  pads.forEach((pad, slot) => {
    const displayAxis = gameSpec(activeGameId).paddleAxisSign === null ? (axes[slot] ?? 0) : displayPaddleAxis(activeGameId, axes[slot] ?? 0);
    const fraction = (displayAxis - AXIS_MIN) / (AXIS_MAX - AXIS_MIN);
    pad.style.setProperty('--paddle-position', `${fraction * 100}%`);
    pad.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    pad.setAttribute('aria-disabled', String(!ready || paused || resetting || failed || slot >= axes.length));
    pad.tabIndex = ready && !paused && !resetting && !failed && slot < axes.length ? 0 : -1;
  });
}

function releaseInputs(): void {
  controls.release();
  releaseDirectionActivation.forEach((release) => release());
  pausedMenuButtons.clear();
  for (const [id, slot] of pointers) if (pads[slot].hasPointerCapture(id)) pads[slot].releasePointerCapture(id);
  pointers.clear();
  for (const [id, pointer] of directionPointers) if (id >= 0 && pointer.target.hasPointerCapture(id)) pointer.target.releasePointerCapture(id);
  directionPointers.clear();
  const capturedServe = [...servePointers]; servePointers.clear();
  for (const id of capturedServe) if (serveButton.hasPointerCapture(id)) serveButton.releasePointerCapture(id);
  serveButton.classList.remove('active');
  document.querySelectorAll('.direction-button').forEach((button) => button.classList.remove('active'));
  pads.forEach((pad) => pad.classList.remove('active'));
  if (ready) send({ type: 'release' });
}

function showStatus(message?: string): void {
  if (message) { status.textContent = message; return; }
  const breakoutOptions = lastSnapshot?.gameId === 'breakout' ? lastSnapshot.options : settingsUI.preferences.optionsByGame.breakout;
  const breakoutStatus = 'coinage' in breakoutOptions && breakoutOptions.coinage === 2
    ? 'Insert a coin for two credits, choose Start 1P or Start 2P, then Serve'
    : 'Insert one coin for Start 1P or two coins for Start 2P, then Serve';
  status.textContent = paused ? 'Paused — tap Resume.' : !ready ? `Loading ${gameSpec(activeGameId).title}…` : lastSnapshot?.run ? 'Game on' : activeGameId === 'pongdoubles' ? 'Insert one coin for two players or two coins for four players, then Start' : activeGameId === 'breakout' ? breakoutStatus : gameSpec(activeGameId).hasStart ? 'Insert a coin, then Start to play' : 'Insert a coin to play';
}

function pauseGame(message?: string): void {
  soundAttempt += 1;
  if (!ready || failed) return;
  paused = true;
  setClock(false);
  releaseInputs();
  audio.pause();
  pauseButton.setAttribute('aria-pressed', 'true');
  if (!['library', 'game-info', 'settings', 'help', 'about', 'qualification'].includes(screen)) showScreen('paused');
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
  startButton.disabled = true;
  pauseButton.disabled = true;
  resetButton.disabled = true;
  element('#error-message').textContent = message;
  showScreen('error');
  updatePads();
  showStatus(`${gameSpec(activeGameId).title} could not load`);
}

function acceptSnapshot(snapshot: CoreSnapshot): void {
  if (snapshot.gameId !== activeGameId) { failGame('The game download did not match your selection. Reload the game.'); return; }
  if (lastSnapshot && (lastSnapshot.run !== snapshot.run || lastSnapshot.attract !== snapshot.attract)) {
    qualificationBoundary?.('native_run_or_attract_transition');
  }
  lastSnapshot = snapshot;
  snapshot.axes.forEach((axis, slot) => {
    if (snapshot.inputRevision >= (axisRevisions[slot] ?? 0)) axes[slot] = axis;
  });
  updatePads();
  element('[data-testid="score-p1"]').textContent = String(snapshot.scores[0]);
  element('[data-testid="score-p2"]').textContent = String(snapshot.scores[1]);
  showStatus();
}

async function startGame(gameId: PlayableGameId = 'pong'): Promise<void> {
  activeGameId = gameId;
  selectedGameId = gameId;
  helpGameId = gameId;
  qualificationBoundary?.('game_launch');
  navigation.length = 0;
  settingsUI.cancelCapture();
  generation += 1;
  soundAttempt += 1;
  const ownGeneration = generation;
  if (loadTimeout) clearTimeout(loadTimeout);
  for (const request of snapshotRequests.values()) { clearTimeout(request.timeout); request.reject(new Error('A new game started.')); }
  snapshotRequests.clear();
  worker?.terminate();
  ready = false;
  failed = false;
  paused = false;
  framePending = false;
  resetting = false;
  axes = Array(gameSpec(activeGameId).paddleCount).fill(0);
  releaseInputs();
  latestPixels = undefined;
  inputRevision = 0;
  axisRevisions = Array(axes.length).fill(0);
  generatedSamples = 0;
  workerTimeMs = 0;
  workerSteps = 0;
  workerMaxMs = 0;
  lastSnapshot = undefined;
  settingsUI.setActiveGame(undefined);
  controls.setGame(activeGameId, settingsUI.bindingsFor(activeGameId));
  configureGameControls();
  audio.pause();
  soundAvailable = false;
  updateSoundButton();
  updatePads();
  showScreen('loading');
  overlayLabel.textContent = `Loading ${gameSpec(activeGameId).title}…`;
  showStatus();
  coinButton.disabled = true;
  startButton.disabled = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute('aria-pressed', 'false');
  resetButton.disabled = true;
  element('[data-testid="score-p1"]').textContent = '0';
  element('[data-testid="score-p2"]').textContent = '0';
  if (!context || typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
    failGame(`This browser cannot run ${gameSpec(activeGameId).title}. Try a recent version of Chrome, Firefox, Edge or Safari.`);
    return;
  }
  // This call happens directly within the player's gesture, before loading awaits.
  void trySound();
  worker = new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('error', () => { if (generation === ownGeneration) failGame(`${gameSpec(activeGameId).title} could not load. Check your connection and reload the game.`); });
  worker.addEventListener('message', (event: MessageEvent<CoreEvent>) => {
    if (generation !== ownGeneration || failed) return;
    const message = event.data;
    switch (message.type) {
      case 'ready':
        if (loadTimeout) clearTimeout(loadTimeout);
        canvas.width = message.width;
        canvas.height = message.height;
        gameStage.style.setProperty('--court-aspect', String(message.width / message.height));
        sampleRate = message.sampleRate;
        ready = true;
        coinButton.disabled = false;
        startButton.disabled = false;
        settingsUI.setActiveGame(activeGameId);
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
        renderHelp();
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
  send({ type: 'init', moduleUrl: coreAssetUrls.moduleUrl, seed: SEED, gameId: activeGameId, options: settingsUI.preferences.optionsByGame[activeGameId] });
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = setTimeout(() => { if (generation === ownGeneration && !ready) failGame(`${gameSpec(activeGameId).title} is taking too long to load. Check your connection and reload the game.`); }, 30000);
}

function insertCoin(): void {
  if (!ready || failed || resetting) return;
  qualificationBoundary?.('insert_coin');
  // Original hardware needs an initial settled interval; the first press is retained.
  if (paused) resumeGame();
  else void trySound();
  send({ type: 'coin' });
  focusGame();
}

function startRound(player: 1 | 2 = 1): void {
  if (!ready || failed || resetting || gameSpec(activeGameId).startButtons < player) return;
  qualificationBoundary?.('start_game_switch');
  if (paused) resumeGame(); else void trySound();
  send(activeGameId === 'breakout' ? { type: 'start', player } : { type: 'start' }); focusGame();
}

function resetGame(): void {
  if (!ready || failed || resetting) return;
  qualificationBoundary?.('reset');
  releaseInputs();
  axes = Array(gameSpec(activeGameId).paddleCount).fill(0);
  updatePads();
  audio.clear();
  resetting = true;
  controls.setEnabled(false);
  updatePads();
  clockEpoch += 1;
  framePending = false;
  latestPixels = undefined;
  send({ type: 'reset', id: ++resetId, seed: SEED, epoch: clockEpoch, running: !paused && !document.hidden, options: settingsUI.preferences.optionsByGame[activeGameId] });
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
  settingsUI.setActiveGame(undefined);
  axes = Array(gameSpec(activeGameId).paddleCount).fill(0);
  soundAvailable = false;
  coinButton.disabled = true;
  startButton.disabled = true;
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
    for (const binding of settingsUI.bindingsFor(activeGameId).gamepad.buttons.menu) {
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
    const horizontal = gameSpec(activeGameId).paddleOrientation === 'horizontal';
    if ((horizontal ? bounds.width : bounds.height) <= 0) return;
    const fraction = Math.max(0, Math.min(1, horizontal ? (event.clientX - bounds.left) / bounds.width : (event.clientY - bounds.top) / bounds.height));
    axes[slot] = canonicalPaddleAxis(activeGameId, Math.round(AXIS_MIN + fraction * (AXIS_MAX - AXIS_MIN)));
    updatePads();
    sendInputs(slot);
  }
  pad.addEventListener('pointerdown', (event) => {
    if (!ready || paused || failed || resetting || slot >= axes.length || [...pointers.values()].includes(slot)) return;
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
    const horizontal = gameSpec(activeGameId).paddleOrientation === 'horizontal';
    const negative = horizontal ? 'ArrowLeft' : 'ArrowUp', positive = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (!ready || paused || failed || resetting || slot >= axes.length || ![negative, positive, 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    const displayAxis = displayPaddleAxis(activeGameId, axes[slot]);
    const changed = event.code === 'Home' ? AXIS_MIN : event.code === 'End' ? AXIS_MAX
      : Math.max(AXIS_MIN, Math.min(AXIS_MAX, displayAxis + (event.code === negative ? -2048 : 2048)));
    axes[slot] = canonicalPaddleAxis(activeGameId, changed);
    updatePads();
    sendInputs(slot);
  });
});

document.querySelectorAll<HTMLButtonElement>('.direction-button').forEach((button) => {
  const slot = Number(button.dataset.slot);
  const direction = button.dataset.direction as 'up' | 'down';
  function sync(): void {
    const held = [...directionPointers.values()].filter((pointer) => pointer.slot === slot);
    controls.setTouchButtons(slot, held.some((pointer) => pointer.direction === 'up'), held.some((pointer) => pointer.direction === 'down'));
  }
  button.addEventListener('pointerdown', (event) => {
    if (!ready || paused || failed || resetting || activeGameId !== 'spacerace') return;
    event.preventDefault();
    directionPointers.set(event.pointerId, { slot, direction, target: button });
    button.setPointerCapture(event.pointerId); button.classList.add('active'); sync();
  });
  const release = (event: PointerEvent): void => {
    if (directionPointers.get(event.pointerId)?.target !== button) return;
    directionPointers.delete(event.pointerId);
    if (![...directionPointers.values()].some((pointer) => pointer.target === button)) button.classList.remove('active');
    sync();
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  // Native keyboard activation gives these accessible buttons a held switch,
  // separately from the remappable player keys handled by the input adapter.
  const heldActivation = new Set<string>();
  releaseDirectionActivation.push(() => heldActivation.clear());
  button.addEventListener('keydown', (event) => {
    if (!ready || paused || resetting || failed || activeGameId !== 'spacerace' || !['Space', 'Enter'].includes(event.code)) return;
    event.preventDefault(); event.stopPropagation(); if (event.repeat) return; heldActivation.add(event.code);
    directionPointers.set(-(slot * 2 + (direction === 'up' ? 1 : 2)), { slot, direction, target: button });
    button.classList.add('active'); sync();
  });
  button.addEventListener('keyup', (event) => {
    if (!heldActivation.delete(event.code)) return;
    event.preventDefault(); event.stopPropagation();
    if (heldActivation.size === 0) {
      directionPointers.delete(-(slot * 2 + (direction === 'up' ? 1 : 2)));
      if (![...directionPointers.values()].some((pointer) => pointer.target === button)) button.classList.remove('active'); sync();
    }
  });
  button.addEventListener('blur', () => {
    heldActivation.clear(); directionPointers.delete(-(slot * 2 + (direction === 'up' ? 1 : 2)));
    if (![...directionPointers.values()].some((pointer) => pointer.target === button)) button.classList.remove('active'); sync();
  });
});

// Serve is an original held switch. Pointer contacts and accessible button
// activation combine with remapped keyboard/gamepad holds in the adapter.
const serveActivation = new Set<string>();
function syncServeContact(): void { controls.setTouchServe(servePointers.size > 0 || serveActivation.size > 0); }
releaseDirectionActivation.push(() => serveActivation.clear());
serveButton.addEventListener('pointerdown', (event) => {
  if (!ready || paused || failed || resetting || activeGameId !== 'breakout') return;
  event.preventDefault(); servePointers.add(event.pointerId);
  serveButton.setPointerCapture(event.pointerId); syncServeContact();
});
function releaseServeContact(event: PointerEvent): void {
  if (!servePointers.delete(event.pointerId)) return;
  syncServeContact();
}
serveButton.addEventListener('pointerup', releaseServeContact);
serveButton.addEventListener('pointercancel', releaseServeContact);
serveButton.addEventListener('lostpointercapture', releaseServeContact);
serveButton.addEventListener('keydown', (event) => {
  if (!ready || paused || resetting || failed || activeGameId !== 'breakout' || !['Space', 'Enter'].includes(event.code)) return;
  event.preventDefault(); event.stopPropagation();
  if (!event.repeat) { serveActivation.add(event.code); syncServeContact(); }
});
serveButton.addEventListener('keyup', (event) => {
  if (!serveActivation.delete(event.code)) return;
  event.preventDefault(); event.stopPropagation(); syncServeContact();
});
serveButton.addEventListener('blur', () => { serveActivation.clear(); syncServeContact(); });

document.addEventListener('keydown', (event) => {
  if (settingsUI.handleCaptureKey(event)) return;
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target as HTMLElement | null;
  if (event.code === 'Escape' && !event.repeat) {
    if (['library', 'game-info', 'settings', 'help', 'about', 'qualification'].includes(screen)) { event.preventDefault(); closePanel(); }
    else if (ready && !failed) { event.preventDefault(); if (paused) resumeGame(); else pauseGame(); }
    return;
  }
  if (!ready || failed || target?.matches('input, textarea, select') || target?.isContentEditable) return;
  // Native button activation remains available in game menus and after a click.
  if (target?.closest('button') && ['Space', 'Enter'].includes(event.code)) return;
  if (screen === 'paused') {
    if (!event.repeat && settingsUI.bindingsFor(activeGameId).keyboard.menu.includes(event.code)) {
      event.preventDefault(); resumeGame();
    }
    return;
  }
  if (screen !== 'playing' || resetting) return;
  controls.handleKeyDown(event);
});
overlay.addEventListener('keydown', (event) => {
  if (event.code !== 'Tab') return;
  const controls = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary')]
    .filter((control) => !control.closest<HTMLElement>('[hidden]'));
  if (!controls.length) { event.preventDefault(); return; }
  const index = controls.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)!.focus(); }
  else if (!event.shiftKey && (index === -1 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
});
document.addEventListener('keyup', (event) => { controls.handleKeyUp(event); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { settingsUI.cancelCapture(); pauseGame('Paused while you were away.'); releaseInputs(); } });
window.addEventListener('blur', () => { settingsUI.cancelCapture(); pauseGame('Paused while you were away.'); releaseInputs(); });
function releaseResizedInputs(): void {
  // A captured touch belongs to the old control geometry. Require a fresh
  // contact after rotation/viewport resizing instead of moving the paddle.
  if (pointers.size || directionPointers.size || servePointers.size) releaseInputs();
}
window.addEventListener('resize', releaseResizedInputs);
window.visualViewport?.addEventListener('resize', releaseResizedInputs);
window.addEventListener('pagehide', () => { pauseGame('Paused while you were away.'); releaseInputs(); audio.pause(); });
window.addEventListener('pageshow', (event) => {
  syncHomeScreenGuidance();
  if (event.persisted) {
    settingsUI.cancelCapture();
    pauseGame('Paused while you were away. Tap Resume to continue.');
    releaseInputs();
    audio.pause();
  }
});
playButton.addEventListener('click', () => { void startGame(); });
element('#retry').addEventListener('click', () => { void startGame(activeGameId); });
coinButton.addEventListener('click', insertCoin);
startButton.addEventListener('click', () => startRound());
start2Button.addEventListener('click', () => startRound(2));
pauseButton.addEventListener('click', () => { if (paused) void resumeGame(); else pauseGame(); });
resumeButton.addEventListener('click', () => resumeGame());
backButton.addEventListener('click', closePanel);
element('#return-title').addEventListener('click', returnToTitle);
element('#return-library').addEventListener('click', returnToLibrary);
element('[data-testid="play-selected"]').addEventListener('click', () => { if (isPlayableGameId(selectedGameId)) void startGame(selectedGameId); });
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
      if (action === 'help') helpGameId = ready ? activeGameId : isPlayableGameId(selectedGameId) ? selectedGameId : 'pong';
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
observeHomeScreenDisplay(() => { releaseResizedInputs(); syncHomeScreenGuidance(); });
showScreen('title');
requestAnimationFrame(animationFrame);

if (new URLSearchParams(location.search).has('debug')) {
  const debugWindow = window as unknown as { __nocpuDebug: { snapshot: () => Promise<QualificationSnapshot> } };
  const identity = () => ({ generation, resetId, clockEpoch, resetting, ready, failed });
  debugWindow.__nocpuDebug = {
    snapshot: async () => {
      if (!ready || !worker) throw new Error(`${gameSpec(activeGameId).title} is not ready.`);
      const identityBefore = identity();
      const id = ++snapshotId;
      const state = await new Promise<CoreSnapshot>((resolve, reject) => {
        const timeout = setTimeout(() => { snapshotRequests.delete(id); reject(new Error(`${gameSpec(activeGameId).title} did not answer.`)); }, 5000);
        snapshotRequests.set(id, { resolve, reject, timeout });
        send({ type: 'snapshot', id });
      });
      return {
        identityBefore, identity: identity(),
        gameId: state.gameId, gameOptions: state.options, nativeRunning: state.run,
        timePs: state.timeps, frame: state.frame, hits: state.hits, scores: state.scores,
        runN: Number(!state.run), attractN: state.attract === null ? null : Number(!state.attract),
        inputs: { coin: Number(state.coin), start: Number(state.start), startPlayer: state.startPlayer, startsQueued: state.startsQueued,
          serve: Number(state.serve), paddle1: state.axes[0], paddle2: state.axes[1], paddle3: state.axes[2], paddle4: state.axes[3], directions: state.directions },
        display: { width: state.width, height: state.height, pixelFormat: state.pixelFormat }, breakout: state.breakout,
        crashes: state.crashes,
        heldKeys: controls.getState().heldKeys, pointerCount: pointers.size + directionPointers.size + servePointers.size, paused, screen, selectedGame: selectedGameId,
        audio: { generatedSamples, coreOverruns: state.audioOverruns, transportDroppedSamples: state.audioTransportDroppedSamples, ...audio.metrics() },
        worker: { simulatedUs: Number(BigInt(state.timeps) / 1000000n), steps: workerSteps, totalMs: workerTimeMs, maxMs: workerMaxMs,
          wasmMemoryCapacityBytes: state.wasmMemoryCapacityBytes },
      };
    },
  };
  installQualificationPanel(debugWindow.__nocpuDebug.snapshot);
}

function installQualificationPanel(snapshot: () => Promise<QualificationSnapshot>): void {
  // This entire interface and its recorder exist only after explicit ?debug opt-in.
  element('.overlay-card').insertAdjacentHTML('beforeend', `
    <section class="panel-section qualification-panel" data-panel="qualification" data-testid="qualification-panel" hidden>
      <h1 id="qualification-heading">Phone qualification</h1>
      <p>Prepare a game first: choose Play, Insert coin and the game’s Start button where present. Use two coins before Start to test all four Pong Doubles paddles. Breakout needs one credit for Start 1P or two credits for Start 2P, then Serve; the default coinage supplies one credit per coin. Then Menu → Qualification → Start recording. For the Pong baseline, play until the recorder has at least 600 active seconds; a session can take longer than ten minutes. New-title checks can be shorter; the report’s ten-minute comparison does not set their release requirement. Menu, pause, background and game-over time are excluded. Start another game after it ends. Record each title separately; switching titles or game settings makes the recording incomplete.</p>
      <p>Collection starts only when you choose Start. Reports stay on this page until you download or copy them; reload closes this report. Speaker sound, touch comfort, recovery and controller behavior need your own observations.</p>
      <p data-testid="qualification-status" role="status" aria-live="polite"></p>
      <div class="menu-inline-actions">
        <button data-testid="qualification-play">Play Pong</button>
        <button data-testid="qualification-prepare">Retry build identity</button>
        <button class="primary-button" data-testid="qualification-start" disabled>Start</button>
        <button class="primary-button" data-testid="qualification-finish" hidden>Finish</button>
      </div>
      <fieldset class="qualification-details">
        <legend>Optional device details and observations</legend>
        <p>Leave anything you did not test or cannot identify blank. You can add or edit these details after Finish; measurements stay fixed. Download or copy again after editing. Do not include private files or account information.</p>
        <p>Device details stay between reports. Each new recording clears observations, input response and notes; enter them for that recording after Finish.</p>
        <label for="qualification-physical">Actual physical device
          <select id="qualification-physical" data-testid="qualification-physical"><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No (automation or emulation)</option></select>
        </label>
        <label for="qualification-platform">Platform
          <select id="qualification-platform" data-testid="qualification-platform"><option value="">Unknown</option><option>Android</option><option>iPhone</option><option>Other</option></select>
        </label>
        <label for="qualification-model">Device model<input id="qualification-model" data-testid="qualification-model" type="text" maxlength="160" autocomplete="off" /></label>
        <label for="qualification-os">OS and version<input id="qualification-os" data-testid="qualification-os" type="text" maxlength="160" autocomplete="off" /></label>
        <label for="qualification-browser">Browser<input id="qualification-browser" data-testid="qualification-browser" type="text" maxlength="160" autocomplete="off" /></label>
        <label for="qualification-browser-version">Browser version<input id="qualification-browser-version" data-testid="qualification-browser-version" type="text" maxlength="160" autocomplete="off" /></label>
        <label for="qualification-controller">Controller model and connection, if tested<input id="qualification-controller" data-testid="qualification-controller" type="text" maxlength="240" autocomplete="off" /></label>
        <label for="qualification-observations">Observed checks: touch, portrait/landscape, speaker sound, pause/reset, interruptions, menus/settings and controller tests<textarea id="qualification-observations" data-testid="qualification-observations" rows="5" maxlength="4000"></textarea></label>
        <label for="qualification-input-response">Observed player input response and how you checked it, if tested<textarea id="qualification-input-response" data-testid="qualification-input-response" rows="3" maxlength="2000"></textarea></label>
        <label for="qualification-notes">Conditions, thermal behavior, slowdown or other notes<textarea id="qualification-notes" data-testid="qualification-notes" rows="3" maxlength="3000"></textarea></label>
      </fieldset>
      <section class="qualification-result" data-testid="qualification-result" hidden aria-labelledby="qualification-report-heading">
        <h2 id="qualification-report-heading">Finished report</h2>
        <p>Review the report before sharing it. Measurements describe this recording; they do not grant release readiness. Memory is Wasm linear-memory capacity. Frame pacing describes browser callback opportunities. Neither measures total phone memory, displayed FPS or speaker output.</p>
        <div class="menu-inline-actions"><button data-testid="qualification-export">Download report</button><button data-testid="qualification-copy">Copy report</button></div>
        <p data-testid="qualification-export-status" role="status" aria-live="polite">You can also select the report text below and copy it.</p>
        <label for="qualification-report">Report JSON</label>
        <textarea id="qualification-report" data-testid="qualification-report" rows="10" readonly spellcheck="false"></textarea>
      </section>
    </section>`);
  const titleEntry = document.createElement('button');
  titleEntry.textContent = 'Qualification';
  titleEntry.dataset.testid = 'open-qualification';
  element('[data-panel="title"] .menu-actions').append(titleEntry);
  const menuEntry = document.createElement('button');
  menuEntry.textContent = 'Qualification';
  menuEntry.dataset.testid = 'menu-qualification';
  element('[data-panel="paused"] .menu-actions').append(menuEntry);

  const start = element<HTMLButtonElement>('[data-testid="qualification-start"]');
  const finish = element<HTMLButtonElement>('[data-testid="qualification-finish"]');
  const prepare = element<HTMLButtonElement>('[data-testid="qualification-prepare"]');
  const details = element<HTMLFieldSetElement>('.qualification-details');
  const reportText = element<HTMLTextAreaElement>('[data-testid="qualification-report"]');
  const exportStatus = element('[data-testid="qualification-export-status"]');
  let prepared = false;
  let preparing = false;
  let preparationError: string | undefined;
  let completedReport: QualificationReport | undefined;
  let unfinishedRun = false;
  const recorder = createQualificationRecorder({
    snapshot, manifestUrl: new URL(`${base}BUILD-MANIFEST.json`, document.baseURI).href,
    expectedVersion: __NOCPU_VERSION__,
    assetIdentity: { entryUrl: import.meta.url, ...coreAssetUrls,
      coreJsSha256: __NOCPU_CORE_JS_SHA256__, coreWasmSha256: __NOCPU_CORE_WASM_SHA256__ },
    activity: () => screen === 'playing' && !paused && !resetting && ready && !failed
      && !document.hidden && document.hasFocus() && Boolean(lastSnapshot?.run) && !lastSnapshot?.attract,
    onStatus: () => render(),
  });
  qualificationBoundary = recorder.boundary;

  function render(): void {
    const state = recorder.status();
    const busy = preparing || state.phase === 'starting' || state.phase === 'finishing';
    const recording = state.phase === 'recording';
    const hasReport = Boolean(completedReport);
    const activeSeconds = Math.floor(state.activeWallLowerBoundSeconds);
    element('[data-testid="qualification-status"]').textContent = preparing ? 'Checking build identity before recording…'
      : busy ? (state.phase === 'starting' ? 'Starting recorder…' : 'Finishing report…')
      : recording ? `Recording: at least ${activeSeconds} active seconds, with timing uncertainty accounted for. Paused here; Back returns to Menu. Resume to continue.${state.error ? ` Collection error: ${state.error}. Finish to export limitations.` : ''}`
      : preparationError ? `Build identity unavailable: ${preparationError}. Retry before starting.`
      : state.error ? `Recorder error: ${state.error}.${unfinishedRun ? ' Finish to export the incomplete report.' : ' Any finished report remains available below.'}`
      : hasReport ? `Finished: at least ${activeSeconds} active seconds, with timing uncertainty accounted for. Download or copy the report below. Start new report replaces this report.`
      : !ready ? 'Prepare Pong first. Build identity must be available before Start.'
      : prepared ? `Ready. Start returns to ${gameSpec(activeGameId).title} and records active play only.` : 'Check build identity before Start.';
    start.hidden = unfinishedRun || state.phase === 'finishing';
    start.disabled = busy || !prepared || !ready || failed || resetting;
    start.textContent = hasReport ? 'Start new report' : 'Start';
    finish.hidden = !unfinishedRun && state.phase !== 'finishing';
    finish.disabled = busy;
    prepare.hidden = unfinishedRun || state.phase === 'starting' || state.phase === 'finishing' || (prepared && !preparationError);
    prepare.disabled = busy;
    element('[data-testid="qualification-play"]').hidden = ready || unfinishedRun || busy;
    details.disabled = busy;
    element('[data-testid="qualification-result"]').hidden = !hasReport;
    if (screen === 'qualification') {
      const panel = element('[data-testid="qualification-panel"]');
      const focused = document.activeElement;
      const available = (control: HTMLElement): boolean => !control.closest('[hidden]') && !control.matches(':disabled');
      // Rendering can hide the initial Play/Start/Finish target. Keep focus on
      // an available pane control without stealing it from an active form field.
      if (focused !== backButton && (!(focused instanceof HTMLElement) || !available(focused)
        || !panel.contains(focused) || (focused === panel && !busy))) {
        const target = [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea')].find(available) ?? panel;
        target.focus({ preventScroll: true });
      }
    }
  }

  async function prepareIdentity(): Promise<void> {
    if (preparing || prepared || unfinishedRun || ['starting', 'recording', 'finishing'].includes(recorder.status().phase)) return;
    preparing = true;
    preparationError = undefined;
    render();
    try { await recorder.prepare(); prepared = true; }
    catch (error) { preparationError = error instanceof Error ? error.message : String(error); }
    finally { preparing = false; render(); }
  }

  function openQualification(): void {
    openPanel('qualification');
    render();
    void prepareIdentity();
  }

  function metadata(): QualificationMetadata {
    const value = (id: string): string | undefined => element<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#qualification-${id}`).value.trim() || undefined;
    const physical = value('physical');
    const observations = value('observations');
    const inputResponse = value('input-response');
    return { physical: physical === 'yes' ? true : physical === 'no' ? false : null,
      platform: value('platform'), model: value('model'), osVersion: value('os'), browser: value('browser'),
      browserVersion: value('browser-version'), controller: value('controller'),
      observations: { ...(observations ? { manual: observations } : {}), ...(inputResponse ? { input_response: inputResponse } : {}) }, notes: value('notes') };
  }

  details.addEventListener('input', () => {
    if (!completedReport) return;
    completedReport = annotateQualificationReport(completedReport, metadata());
    reportText.value = `${JSON.stringify(completedReport, null, 2)}\n`;
    exportStatus.textContent = 'Details updated; measurements unchanged. Download or copy this updated report.';
  });

  titleEntry.addEventListener('click', openQualification);
  menuEntry.addEventListener('click', openQualification);
  prepare.addEventListener('click', () => { prepared = false; void prepareIdentity(); });
  element('[data-testid="qualification-play"]').addEventListener('click', () => { void startGame(); });
  start.addEventListener('click', () => {
    if (start.disabled) return;
    // Preserve the phone's audio activation gesture; preflight networking is complete.
    completedReport = undefined;
    reportText.value = '';
    // Device identity may stay on the same browser, but manual observations
    // describe one recording and must not carry into another game's report.
    for (const id of ['observations', 'input-response', 'notes']) {
      element<HTMLTextAreaElement>(`#qualification-${id}`).value = '';
    }
    closePanel();
    resumeGame(true);
    const starting = recorder.start();
    unfinishedRun = ['starting', 'recording'].includes(recorder.status().phase);
    render();
    void starting.catch(() => { prepared = false; openQualification(); });
  });
  finish.addEventListener('click', () => {
    if (finish.disabled) return;
    void recorder.finish(metadata()).then((report) => {
      completedReport = report;
      unfinishedRun = false;
      reportText.value = `${JSON.stringify(report, null, 2)}\n`;
      exportStatus.textContent = 'You can also select the report text below and copy it.';
      prepared = false;
      render();
    }).catch((error) => { exportStatus.textContent = `Report could not finish: ${error instanceof Error ? error.message : String(error)}.`; render(); });
  });
  element('[data-testid="qualification-export"]').addEventListener('click', () => {
    if (!completedReport) return;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([reportText.value], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `nocpu-qualification-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      link.hidden = true;
      shell.append(link);
      link.click();
      link.remove();
      exportStatus.textContent = 'Download requested. If your browser does not save it, select and copy the report text below.';
    } catch { exportStatus.textContent = 'Download is unavailable. Select and copy the report text below.'; }
    finally { if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000); } }
  });
  element('[data-testid="qualification-copy"]').addEventListener('click', () => {
    if (!completedReport) return;
    reportText.focus({ preventScroll: true });
    reportText.select();
    if (!navigator.clipboard?.writeText) { exportStatus.textContent = 'Report text selected. Use your browser’s Copy action.'; return; }
    void navigator.clipboard.writeText(reportText.value).then(() => { exportStatus.textContent = 'Report copied.'; }, () => {
      exportStatus.textContent = 'Clipboard is unavailable. Report text selected; use your browser’s Copy action.';
    });
  });
  render();
}
