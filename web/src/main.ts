// NoCPU browser frontend, GPL-3.0-or-later. Original DICE circuit engine: DICE Team.
import './style.css';
import { CircuitAudio } from './audio';
import { GAMES, getGame } from './catalog';
import { createShellMarkup, escapeText, gameInfoMarkup } from './shell-ui';
import { buildString, devBuildString } from './build-info';
import { createSettingsUI } from './app-settings';
import { createControls } from './controls';
import { actionLabel, directionAction, keyLabel } from './control-schema';
import { createCoreAssetUrls } from './asset-identity';
import { canonicalPaddleAxis, gameSpec, isPlayableGameId, type PlayableGameId } from './game-contract';
import { isMouseGame } from './preferences';
import type { CoreCommand, CoreEvent, CoreSnapshot } from './protocol';

const base = import.meta.env.BASE_URL;
const coreAssetUrls = createCoreAssetUrls(new URL(base, document.baseURI).href, __NOCPU_CORE_JS_SHA256__, __NOCPU_CORE_WASM_SHA256__);
const source = `${base}source/nocpu-${__NOCPU_VERSION__}-source.tar.gz`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = createShellMarkup(base, source, devBuildString(__NOCPU_VERSION__));

function element<T extends HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
// The packaged BUILD-MANIFEST.json names the release tag or source commit;
// without it (for example the Vite dev server) the build stays vX.Y.Z-dev.
void fetch(`${base}BUILD-MANIFEST.json`, { cache: 'no-store' }).then(async (response) => {
  if (!response.ok) return;
  const build = buildString(__NOCPU_VERSION__, await response.json());
  element('#build-string').textContent = build;
  element('[data-testid="title-version"]').textContent = build;
}).catch(() => { /* No manifest: keep the development build string. */ });
const startButton = element<HTMLButtonElement>('[data-testid="start-game"]');
const start2Button = element<HTMLButtonElement>('[data-testid="start-game-2"]');
const coinButton = element<HTMLButtonElement>('[data-testid="insert-coin"]');
const pauseButton = element<HTMLButtonElement>('[data-testid="pause"]');
const resetButton = element<HTMLButtonElement>('[data-testid="reset"]');
const resumeButton = element<HTMLButtonElement>('#resume');
const backButton = element<HTMLButtonElement>('#back');
const muteButton = element<HTMLButtonElement>('[data-testid="mute"]');
const status = element('[data-testid="status"]');
const hudStatus = element('#hud-status');
const overlay = element('#screen-overlay');
const overlayLabel = element('#overlay-label');
const canvas = element<HTMLCanvasElement>('[data-testid="game-canvas"]');
const shell = element('.game-shell');
const gameStage = element('.game-stage');
const hud = element('.game-hud');
const context = canvas.getContext('2d', { alpha: false });
const audio = new CircuitAudio(() => pauseGame('Sound interrupted — choose Resume.'));
const AXIS_MIN = -32768;
const AXIS_MAX = 32767;
const SEED = 848;
// Each edge of the display keeps this fraction in reserve, so the mouse
// reaches both ends of the original control range without leaving the display.
const MOUSE_EDGE = 0.05;
let axes: number[] = [0, 0];
// Mouse button holds: the Stunt Cycle throttle and the Breakout Serve switch.
let mouseThrottle: number | undefined;
let mouseServe: number | undefined;
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
type Screen = 'title' | 'library' | 'game-info' | 'loading' | 'playing' | 'paused' | 'settings' | 'help' | 'about' | 'error';
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
  onPlayRom: (gameId) => { void startGame(gameId); },
  onRomRemoved: (gameId) => { if (ready && gameId === activeGameId) disposeGame('library'); },
  onMouse: () => { releaseInputs(); renderHelp(); },
});
const controls = createControls({
  bindings: settingsUI.preferences.bindings,
  onDirections: (directions) => { if (ready && !paused && !resetting) send({ type: 'keys', directions }); },
  onAxes: (changes) => {
    if (!ready || paused || resetting || failed) return;
    changes.forEach((axis, slot) => {
      if (axis === null || (mouseThrottle !== undefined && slot === settingsUI.mouseSlotFor(activeGameId))) return;
      axes[slot] = gameSpec(activeGameId).inputKind === 'paddle' ? canonicalPaddleAxis(activeGameId, axis) : axis;
      sendInputs(slot);
    });
  },
  onAction: (action) => {
    if (!ready || failed || resetting || screen !== 'playing') return;
    if (action === 'coin') insertCoin();
    else if (action.startsWith('coin')) insertCoin(action === 'coinDollar' ? 5 : Number(action.slice(4)) as 1 | 2 | 3 | 4);
    else if (action === 'start') startRound();
    else if (action === 'start2') startRound(2);
    else if (action === 'menu') pauseGame();
    else if (action === 'reset') resetGame();
    else if (action === 'mute') muteButton.click();
  },
  onServe: (held) => {
    if (!ready || failed || activeGameId !== 'breakout' || (held && (paused || resetting))) return;
    send({ type: 'serve', held });
  },
  onGamepads: settingsUI.syncGamepads,
  onButtons: (gas, brake) => {
    if (ready && !failed && activeGameId === 'indy4') send({ type: 'buttons', gas, brake });
  },
  onDisconnect: releaseInputs,
});
muted = settingsUI.preferences.muted;
audio.setMuted(muted);
audio.setVolume(settingsUI.preferences.volume);
element<HTMLInputElement>('#volume').value = String(Math.round(settingsUI.preferences.volume * 100));
settingsUI.syncGamepads([]);

function focusGame(): void { canvas.focus({ preventScroll: true }); }

// The Library opens on the last game that loaded while it is still playable;
// otherwise on its first game.
function lastPlayedGameButton(): HTMLElement | undefined {
  const gameId = settingsUI.preferences.lastGameId;
  if (!gameId || !GAMES.some((game) => game.id === gameId && game.playable)) return undefined;
  return document.querySelector<HTMLElement>(`.library-game[data-game-id="${gameId}"]`) ?? undefined;
}

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
    const lastPlayed = next === 'library' ? lastPlayedGameButton() : undefined;
    const focusTarget = lastPlayed ?? (next === 'library' ? panel.querySelector<HTMLElement>('.library-game') : undefined)
      ?? panel.querySelector<HTMLElement>('button:not(:disabled), a, input:not(:disabled), select') ?? panel;
    focusTarget.focus({ preventScroll: true });
    lastPlayed?.scrollIntoView({ block: 'nearest' });
  }
}

function openPanel(panel: 'library' | 'game-info' | 'settings' | 'help' | 'about'): void {
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
    const play = element<HTMLButtonElement>('[data-testid="play-selected"]');
    play.textContent = game.playable ? game.roms.length && !settingsUI.romReady(game.id) ? 'Import ROMs to play' : `Play ${game.name}` : 'Browser port pending';
    return;
  }
  element('#game-info-heading').textContent = game.name;
  content.innerHTML = gameInfoMarkup(game, settingsUI.romDescription(game.id));
  content.dataset.gameId = game.id;
  const play = element<HTMLButtonElement>('[data-testid="play-selected"]');
  play.disabled = !game.playable;
  play.textContent = game.playable ? game.roms.length && !settingsUI.romReady(game.id) ? 'Import ROMs to play' : `Play ${game.name}` : 'Browser port pending';
  element('#manage-game-roms').hidden = !game.roms.length;
}

function renderHelp(): void {
  const game = getGame(helpGameId);
  const actions = game.controlSchema.keyboardActions;
  const playingBindings = settingsUI.bindingsFor(activeGameId);
  const playingSpec = gameSpec(activeGameId);
  canvas.setAttribute('aria-label', `${playingSpec.title} game display. ${playingBindings.gamepad.players.map((_, slot) => `${activeGameId === 'breakout' ? 'The shared paddle' : `Player ${slot + 1}`} uses ${playingBindings.keyboard[directionAction(slot, 'Up', activeGameId)].map(keyLabel).join(' / ')} and ${playingBindings.keyboard[directionAction(slot, 'Down', activeGameId)].map(keyLabel).join(' / ')} for ${playingSpec.controlLabels[slot].toLowerCase()}.`).join(' ')} ${mouseHelp(activeGameId)}`);
  element('#help-heading').textContent = game.playable ? `${game.name}: How to play` : `${game.name} controls`;
  if (!isPlayableGameId(game.id)) {
    element('#game-help-content').innerHTML = `<p>${escapeText(game.name)} uses ${game.controlFamilies.map(escapeText).join(', ').toLowerCase()} controls in DICE.</p><ul>${game.controlSchema.controls.map((control) => `<li>${escapeText(control.label)}</li>`).join('')}</ul><p>Its browser port is pending. Keyboard and mouse controls will be available with that port.</p>`;
    return;
  }
  const playableId = game.id;
  const bindings = settingsUI.bindingsFor(game.id);
  const spec = gameSpec(game.id);
  const options = ready && game.id === activeGameId && lastSnapshot ? lastSnapshot.options : settingsUI.preferences.optionsByGame[game.id];
  const rules = game.id === 'pong' ? `Insert a coin to start a two-player game. Return the ball with your paddle. First to ${'winningScore' in options ? options.winningScore : 11} wins.`
    : game.id === 'pongdoubles' ? `Insert one coin for two players or two coins for four players, then press Start. In four-player mode, left and right teams each have an outer and inner paddle. P1 is outer left, P2 outer right, P3 inner left and P4 inner right. First team to ${'winningScore' in options ? options.winningScore : 11} wins.`
      : game.id === 'breakout' ? `Start 1P needs one credit; Start 2P needs two credits. ${'coinage' in options && options.coinage === 2 ? 'One coin supplies two credits with the current setting.' : 'Insert one coin for Start 1P or two coins for Start 2P with the current setting.'} Then hold Serve to launch the ball. Move the shared paddle left or right to break the bricks. Both player starts use the same paddle control.`
        : game.id === 'stuntcycle' ? `Start 1P uses one credit. Start 2P needs at least two credits to select alternating turns. ${'coinage' in options && options.coinage === 2 ? 'One coin supplies two credits with the current setting.' : 'The current setting supplies one credit per coin.'} With only one credit, Start 2P may still start a one-player game. Both modes use one shared throttle to control motorcycle speed. This original circuit has no connected audio.`
        : game.id === 'indy4' ? 'Insert a coin for your color to join. Each of the four cars has independent relative steering, Gas and Hand Brake. Dollar is a separate original bill input. There is no Start button. This original circuit has no connected audio.'
        : 'Insert a coin, then press Start. Move your rocket up or down through the moving obstacles. Reach the top to score before time runs out.';
  const gamepadHelp = `<h2>Current gamepad controls</h2><ul>${bindings.gamepad.players.map((player, slot) => `<li>${game.id === 'breakout' ? 'Shared paddle' : `Player ${slot + 1} (${escapeText(spec.controlLabels[slot].toLowerCase())})`}: controller ${player.pad + 1}, axis ${player.axis + 1}${player.invert ? ' reversed' : ''}; ${Math.round(player.deadzone * 100)}% deadzone.</li>`).join('')}</ul><dl class="controls-help">${actions.map((action) => `<div><dt>${escapeText(actionLabel(action, playableId))}</dt><dd>${bindings.gamepad.buttons[action].map((binding) => `Controller ${binding.pad + 1} · button ${binding.button + 1}`).join(' / ') || 'Unassigned'}</dd></div>`).join('')}</dl><p>${game.id === 'stuntcycle' ? 'The positive joystick range sets the shared throttle; centering returns it to idle. Assigned increase/release buttons hold the original throttle switches.' : game.id === 'indy4' ? 'A moved joystick turns the relative wheel; centering stops turning. The selected browser deadzone scales the joystick before the original circuit input’s 20% deadzone. Direction buttons hold left/right steering. Gas and Hand Brake remain held until their buttons are released.' : game.id === 'spacerace' ? 'A moved joystick holds Up or Down. Center it to release. Opposing directions cancel each other.' : game.id === 'breakout' ? 'A moved joystick sets the shared paddle position. A centered joystick leaves the last position alone. Direction buttons move it left or right. Serve is held while its assigned button is down.' : 'A moved joystick sets paddle height. A centered joystick leaves the last position alone. Direction buttons move the paddle up or down.'} Return joysticks and buttons to neutral after a menu, reset or reconnect.</p>`;
  element('#game-help-content').innerHTML = `<p>${rules}</p><dl class="controls-help">${actions.map((action) => `<div><dt>${escapeText(actionLabel(action, playableId))}</dt><dd>${bindings.keyboard[action].map((code) => `<kbd>${escapeText(keyLabel(code))}</kbd>`).join(' ') || 'Unassigned'}</dd></div>`).join('')}</dl><h2>Mouse</h2><p data-testid="mouse-help">${escapeText(mouseHelp(playableId))}</p>${gamepadHelp}<p>Keyboard, mouse and gamepad assignments can be changed for each game in Settings. Game settings take effect when starting or explicitly resetting that game. Escape opens the menu or goes back.</p>`;
}
function mouseHelp(gameId: PlayableGameId): string {
  if (!isMouseGame(gameId)) return 'This game uses the keyboard or a gamepad; the mouse is not used.';
  const slot = settingsUI.mouseSlotFor(gameId);
  if (slot === null) return 'The mouse is off for this game. Choose a player under Mouse in Settings to use it.';
  if (gameId === 'stuntcycle') return 'Hold the left mouse button over the display and move right to open the shared throttle; release the button to idle.';
  if (gameId === 'breakout') return 'Move the mouse left or right over the display to move the shared paddle across its full range. Hold the left mouse button over the display to hold Serve.';
  return `Move the mouse up or down over the display to move the Player ${slot + 1} paddle (${gameSpec(gameId).controlLabels[slot].toLowerCase()}) across its full range. Settings chooses which player the mouse controls.`;
}

function configureGameControls(): void {
  const spec = gameSpec(activeGameId);
  gameStage.dataset.game = activeGameId;
  shell.dataset.game = activeGameId;
  gameStage.dataset.inputKind = spec.inputKind;
  document.querySelectorAll<HTMLButtonElement>('.indy-coin').forEach((button) => { button.hidden = activeGameId !== 'indy4'; });
  startButton.hidden = !spec.hasStart;
  startButton.textContent = spec.startButtons === 2 ? 'Start 1P' : 'Start';
  startButton.setAttribute('aria-label', spec.startButtons === 2 ? 'Start 1-player game' : 'Start game');
  start2Button.hidden = spec.startButtons < 2;
  coinButton.textContent = activeGameId === 'indy4' ? 'Green' : activeGameId === 'breakout' || activeGameId === 'stuntcycle' ? 'Coin' : 'Insert coin';
  coinButton.setAttribute('aria-label', activeGameId === 'indy4' ? 'Insert coin for Green' : 'Insert coin');
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
  const inheritedSilent = (ready || screen === 'loading') && !getGame(activeGameId).audioWired;
  muteButton.disabled = inheritedSilent;
  if (inheritedSilent) {
    muteButton.setAttribute('aria-pressed', 'false');
    muteButton.textContent = 'No DICE audio'; muteButton.setAttribute('aria-label', 'This game has no connected sound output in DICE');
    element('#sound-note').hidden = false; element('#sound-note').textContent = 'This game inherits unfinished audio with no connected sound output in DICE.';
    return;
  }
  element('#sound-note').textContent = 'Sound is unavailable. Choose Enable sound to try again.';
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.textContent = muted ? 'Sound off' : soundAvailable ? 'Sound on' : 'Enable sound';
  muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : soundAvailable ? 'Mute sound' : 'Enable sound');
}

async function trySound(): Promise<void> {
  if (!getGame(activeGameId).audioWired) return;
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
  document.querySelectorAll<HTMLButtonElement>('.indy-coin').forEach((button) => { button.disabled = !ready || paused || resetting || failed || activeGameId !== 'indy4'; });
}

function releaseInputs(): void {
  controls.release();
  pausedMenuButtons.clear();
  const held = [mouseThrottle, mouseServe];
  mouseThrottle = undefined; mouseServe = undefined;
  for (const id of held) if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  if (activeGameId === 'stuntcycle' || activeGameId === 'indy4') axes.fill(0);
  if (ready) send({ type: 'release' });
}

function showStatus(message?: string): void {
  if (message) { status.textContent = message; hudStatus.textContent = message; return; }
  const breakoutOptions = lastSnapshot?.gameId === 'breakout' ? lastSnapshot.options : settingsUI.preferences.optionsByGame.breakout;
  const breakoutStatus = 'coinage' in breakoutOptions && breakoutOptions.coinage === 2
    ? 'Insert a coin for two credits, choose Start 1P or Start 2P, then Serve'
    : 'Insert one coin for Start 1P or two coins for Start 2P, then Serve';
  status.textContent = paused ? 'Paused — choose Resume.' : !ready ? `Loading ${gameSpec(activeGameId).title}…` : lastSnapshot?.run ? 'Game on' : activeGameId === 'indy4' ? 'Use a color coin to join; steer and hold Gas. Dollar bill uses the original shared input.' : activeGameId === 'stuntcycle' ? 'Insert credits, choose Start 1P or Start 2P, then adjust the shared throttle' : activeGameId === 'pongdoubles' ? 'Insert one coin for two players or two coins for four players, then Start' : activeGameId === 'breakout' ? breakoutStatus : gameSpec(activeGameId).hasStart ? 'Insert a coin, then Start to play' : 'Insert a coin to play';
  hudStatus.textContent = status.textContent;
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
  const launchScreen = screen;
  const launchNavigation = [...navigation];
  activeGameId = gameId;
  selectedGameId = gameId;
  helpGameId = gameId;
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
  axes = Array(gameSpec(activeGameId).axisCount).fill(0);
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
  updateSoundButton();
  overlayLabel.textContent = `Loading ${gameSpec(activeGameId).title}…`;
  showStatus();
  coinButton.disabled = true;
  startButton.disabled = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute('aria-pressed', 'false');
  resetButton.disabled = true;
  element('[data-testid="rom-launch-message"]').hidden = true;
  element('[data-testid="score-p1"]').textContent = '0';
  element('[data-testid="score-p2"]').textContent = '0';
  if (!context || typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
    failGame(`This browser cannot run ${gameSpec(activeGameId).title}. Try a recent version of Chrome, Firefox, Edge or Safari.`);
    return;
  }
  // Unlock sound while still in the gesture for the four games with DICE audio.
  void trySound();
  const roms = await settingsUI.runtimeMembers(gameId);
  if (generation !== ownGeneration) return;
  if (!roms.ok) {
    ready = false; worker = undefined;
    await settingsUI.refreshRoms();
    if (generation !== ownGeneration) return;
    renderGameInfo();
    const message = element('[data-testid="rom-launch-message"]');
    message.textContent = roms.error; message.hidden = false;
    // Missing local assets leave the info panel recoverable, including its
    // original Library/Title focus path. A successful launch starts fresh.
    if (launchScreen === 'game-info') navigation.push(...launchNavigation);
    else {
      navigation.push({ screen: 'title', focus: element('[data-testid="open-library"]') });
      navigation.push({ screen: 'library', focus: element(`[data-game-id="${gameId}"]`) });
    }
    showScreen('game-info');
    return;
  }
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
        updateSoundButton();
        coinButton.disabled = false;
        startButton.disabled = false;
        settingsUI.setActiveGame(activeGameId);
        pauseButton.disabled = false;
        resetButton.disabled = false;
        updatePads();
        acceptSnapshot(message.snapshot);
        if (document.hidden || !document.hasFocus()) pauseGame();
        else { setClock(true); showScreen('playing'); }
        // The Library opens on the last game that actually loaded. The write
        // happens after the game is running and can never stop or delay a launch.
        try { settingsUI.setLastGame(activeGameId); } catch { /* A convenience only. */ }
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
  worker.postMessage({ type: 'init', moduleUrl: coreAssetUrls.moduleUrl, seed: SEED, gameId: activeGameId,
    options: settingsUI.preferences.optionsByGame[activeGameId], roms: roms.value } satisfies CoreCommand,
  roms.value.map((member) => member.bytes.buffer as ArrayBuffer));
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = setTimeout(() => { if (generation === ownGeneration && !ready) failGame(`${gameSpec(activeGameId).title} is taking too long to load. Check your connection and reload the game.`); }, 30000);
}

function insertCoin(channel: 1 | 2 | 3 | 4 | 5 = 1): void {
  if (!ready || failed || resetting) return;
  // Original hardware needs an initial settled interval; the first press is retained.
  if (paused) resumeGame();
  else void trySound();
  send({ type: 'coin', channel });
  focusGame();
}

function startRound(player: 1 | 2 = 1): void {
  if (!ready || failed || resetting || gameSpec(activeGameId).startButtons < player) return;
  if (paused) resumeGame(); else void trySound();
  send(gameSpec(activeGameId).startButtons === 2 ? { type: 'start', player } : { type: 'start' }); focusGame();
}

function resetGame(): void {
  if (!ready || failed || resetting) return;
  releaseInputs();
  axes = Array(gameSpec(activeGameId).axisCount).fill(0);
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
  axes = Array(gameSpec(activeGameId).axisCount).fill(0);
  soundAvailable = false;
  coinButton.disabled = true;
  startButton.disabled = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute('aria-pressed', 'false');
  resetButton.disabled = true;
  updatePads();
  updateSoundButton();
  status.textContent = 'Choose a game from the Library.';
  hudStatus.textContent = '';
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

// Mouse: an absolute position over the display drives the selected player's
// paddle (or the held Stunt Cycle throttle) across the full original range.
function mouseActive(): boolean { return ready && !paused && !failed && !resetting && screen === 'playing'; }
function mouseFraction(event: PointerEvent, horizontal: boolean): number | undefined {
  const bounds = canvas.getBoundingClientRect();
  const size = horizontal ? bounds.width : bounds.height;
  if (size <= 0) return undefined;
  const margin = size * MOUSE_EDGE;
  const offset = (horizontal ? event.clientX - bounds.left : event.clientY - bounds.top) - margin;
  return Math.max(0, Math.min(1, offset / (size - 2 * margin)));
}
function applyMouse(event: PointerEvent): void {
  const slot = settingsUI.mouseSlotFor(activeGameId);
  if (slot === null || !mouseActive() || slot >= axes.length) return;
  const spec = gameSpec(activeGameId);
  let axis: number;
  if (spec.inputKind === 'throttle') {
    if (mouseThrottle !== event.pointerId) return;
    const fraction = mouseFraction(event, true);
    if (fraction === undefined) return;
    axis = Math.round(fraction * AXIS_MAX);
  } else if (spec.inputKind === 'paddle') {
    const fraction = mouseFraction(event, spec.paddleOrientation === 'horizontal');
    if (fraction === undefined) return;
    axis = canonicalPaddleAxis(activeGameId, Math.round(AXIS_MIN + fraction * (AXIS_MAX - AXIS_MIN)));
  } else return;
  if (axes[slot] === axis) return;
  axes[slot] = axis;
  sendInputs(slot);
}
// Browsers can send motionless moves when the layout under a resting pointer
// changes (for example a closing menu); only actual mouse motion moves a paddle.
let lastPointer = '';
let pointerMoved = false;
document.addEventListener('pointermove', (event) => {
  const position = `${event.clientX},${event.clientY}`;
  pointerMoved = position !== lastPointer;
  lastPointer = position;
}, { capture: true });
canvas.addEventListener('pointermove', (event) => { if (pointerMoved) applyMouse(event); });
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  focusGame();
  if (!mouseActive()) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  if (activeGameId === 'stuntcycle' && settingsUI.mouseSlotFor(activeGameId) !== null) mouseThrottle = event.pointerId;
  if (activeGameId === 'breakout' && settingsUI.mouseSlotFor(activeGameId) !== null) { mouseServe = event.pointerId; controls.setPointerServe(true); }
  applyMouse(event);
});
function releaseMouse(event: PointerEvent): void {
  if (mouseThrottle === event.pointerId) {
    mouseThrottle = undefined;
    const slot = settingsUI.mouseSlotFor(activeGameId);
    if (ready && slot !== null && slot < axes.length && axes[slot] !== 0) { axes[slot] = 0; sendInputs(slot); }
  }
  if (mouseServe === event.pointerId) { mouseServe = undefined; controls.setPointerServe(false); }
}
canvas.addEventListener('pointerup', releaseMouse);
canvas.addEventListener('pointercancel', releaseMouse);
canvas.addEventListener('lostpointercapture', releaseMouse);
canvas.addEventListener('contextmenu', (event) => { if (screen === 'playing') event.preventDefault(); });

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
window.addEventListener('pagehide', () => { pauseGame('Paused while you were away.'); releaseInputs(); audio.pause(); });
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    settingsUI.cancelCapture();
    pauseGame('Paused while you were away. Choose Resume to continue.');
    releaseInputs();
    audio.pause();
  }
});
element('#retry').addEventListener('click', () => { void startGame(activeGameId); });
coinButton.addEventListener('click', () => insertCoin());
document.querySelectorAll<HTMLButtonElement>('.indy-coin').forEach((button) => {
  button.addEventListener('click', () => insertCoin(Number(button.dataset.coinChannel) as 2 | 3 | 4 | 5));
});
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
showScreen('title');
requestAnimationFrame(animationFrame);

if (new URLSearchParams(location.search).has('debug')) {
  // Read-only observation for the browser tests; it never alters circuit state.
  const debugWindow = window as unknown as { __nocpuDebug: { snapshot: () => Promise<Record<string, unknown>> } };
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
        stuntcycle: state.stuntcycle, indy4: state.indy4,
        coinChannel: state.coinChannel, coinsQueued: state.coinsQueued,
        switches: { coinCompleted: state.coinCompleted, startCompleted: state.startCompleted },
        driving: { gas: state.gas, brake: state.brake, axes: state.axes, directions: state.directions },
        crashes: state.crashes,
        heldKeys: controls.getState().heldKeys, pointerCount: Number(mouseThrottle !== undefined) + Number(mouseServe !== undefined), paused, screen, selectedGame: selectedGameId,
        audio: { generatedSamples, coreOverruns: state.audioOverruns, transportDroppedSamples: state.audioTransportDroppedSamples, ...audio.metrics() },
        worker: { simulatedUs: Number(BigInt(state.timeps) / 1000000n), steps: workerSteps, totalMs: workerTimeMs, maxMs: workerMaxMs,
          wasmMemoryCapacityBytes: state.wasmMemoryCapacityBytes },
      };
    },
  };
}
