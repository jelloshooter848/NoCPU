// NoCPU browser frontend, GPL-3.0-or-later. Original DICE circuit engine: DICE Team.
import './style.css';
import { CircuitAudio } from './audio';
import type { CoreCommand, CoreEvent, CoreSnapshot } from './protocol';

const base = import.meta.env.BASE_URL;
const source = `${base}source/nocpu-${__NOCPU_VERSION__}-source.tar.gz`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="game-shell" data-screen="title" aria-label="NoCPU circuit arcade">
    <div class="game-stage" id="arcade">
      <div class="screen-frame">
        <canvas data-testid="game-canvas" width="576" height="432" tabindex="0" aria-label="Pong game display. Player 1 uses W and S, player 2 uses Up and Down. On touchscreens drag the left and right halves of the court."></canvas>
        <div class="touch-controls" aria-label="Paddle controls">
          <div class="paddle-control" data-testid="paddle-p1" tabindex="0" role="slider" aria-label="Player 1 paddle position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-orientation="vertical"><span class="control-player" aria-hidden="true">P1</span><span class="control-track" aria-hidden="true"><span class="control-thumb"></span></span><span class="control-help" aria-hidden="true">DRAG</span></div>
          <div class="paddle-control" data-testid="paddle-p2" tabindex="0" role="slider" aria-label="Player 2 paddle position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-orientation="vertical"><span class="control-player" aria-hidden="true">P2</span><span class="control-track" aria-hidden="true"><span class="control-thumb"></span></span><span class="control-help" aria-hidden="true">DRAG</span></div>
        </div>
      </div>
    </div>
    <nav class="game-hud" aria-label="Game actions" hidden>
      <button class="hud-button coin-button" data-testid="insert-coin" disabled>Insert coin</button>
      <button class="hud-button menu-button" id="menu" data-testid="pause" aria-haspopup="dialog" aria-pressed="false" disabled>Menu <span aria-hidden="true">☰</span></button>
    </nav>
    <p class="sr-only" data-testid="status" role="status" aria-live="polite">Choose Play Pong to start.</p>
    <div class="sr-only" aria-label="Score"><span data-testid="score-p1">0</span><span data-testid="score-p2">0</span></div>
    <div class="shell-overlay" id="screen-overlay" role="dialog" aria-modal="true" aria-labelledby="title-heading">
      <div class="overlay-card">
        <button class="back-button" id="back" data-testid="back" hidden>← Back</button>
        <section class="panel-section title-panel" id="intro" data-panel="title">
          <h1 id="title-heading" class="game-logo">NoCPU</h1>
          <p class="game-subtitle">PONG</p>
          <div class="menu-actions">
            <button class="primary-button play-button" data-testid="play-pong">Play Pong</button>
            <button data-action="settings">Settings</button>
            <button data-action="help">How to play</button>
            <button data-action="about">About</button>
          </div>
        </section>
        <section class="panel-section loading-panel" data-panel="loading" hidden>
          <h1 id="loading-heading">Loading Pong</h1>
          <p id="overlay-label">Preparing the circuit…</p>
        </section>
        <section class="panel-section paused-panel" data-panel="paused" hidden>
          <h1 id="paused-heading">Paused</h1>
          <div class="menu-actions">
            <button class="primary-button" id="resume" data-testid="resume">Resume</button>
            <button data-testid="reset" disabled>Reset game</button>
            <button data-action="settings">Settings</button>
            <button data-action="help">How to play</button>
            <button data-action="about">About</button>
            <button id="return-title" data-testid="return-title">Return to title</button>
          </div>
        </section>
        <section class="panel-section settings-panel" data-panel="settings" hidden>
          <h1 id="settings-heading">Settings</h1>
          <div class="sound-control">
            <button data-testid="mute" aria-pressed="false" aria-label="Enable sound">Enable sound</button>
            <label class="volume-label" for="volume">Volume</label>
            <input id="volume" type="range" min="0" max="100" value="60" aria-label="Volume" />
          </div>
          <p id="sound-note" class="sound-note" hidden>Sound is unavailable. Tap Enable sound to try again.</p>
        </section>
        <section class="panel-section help-panel" data-panel="help" hidden>
          <h1 id="help-heading">How to play</h1>
          <p>Insert a coin to start a two-player game. Return the ball with your paddle. First to 11 wins.</p>
          <dl class="controls-help"><div><dt>Player 1</dt><dd><kbd>W</kbd> / <kbd>S</kbd></dd></div><div><dt>Player 2</dt><dd><kbd>↑</kbd> / <kbd>↓</kbd></dd></div><div><dt>Coin / start</dt><dd><kbd>Enter</kbd></dd></div><div><dt>Menu / resume</dt><dd><kbd>Space</kbd> / <kbd>Esc</kbd></dd></div></dl>
          <p>On a touchscreen, drag the left half of the court for player 1 and the right half for player 2. Both players can move at once.</p>
        </section>
        <section class="panel-section about-panel" data-panel="about" hidden>
          <h1 id="about-heading">About NoCPU</h1>
          <p>A continuation of <a href="https://sourceforge.net/projects/dice/" target="_blank" rel="noopener noreferrer">DICE</a>, the Discrete Integrated Circuit Emulator, by the DICE Team.</p>
          <p>Pong runs its original circuit simulation and sound. No ROM file is required.</p>
          <p data-testid="version">Version ${__NOCPU_VERSION__} · <span id="build-id">development</span></p>
          <p class="preview-note" id="release-stage">Browser preview · physical phone qualification pending</p>
          <nav class="about-links" aria-label="Project and license"><a href="https://github.com/jelloshooter848/NoCPU" target="_blank" rel="noopener noreferrer">GitHub</a><a href="${source}" target="_blank" rel="noopener noreferrer">Source</a><a href="${base}notices/LICENSE">GPL v3</a><a href="${base}notices/THIRD_PARTY_NOTICES.md">Credits & notices</a></nav>
        </section>
        <section class="panel-section error-panel" data-panel="error" data-testid="error" role="alert" hidden>
          <h1 id="error-heading">Unable to load Pong</h1>
          <p id="error-message"></p>
          <button class="primary-button" id="retry">Reload game</button>
          <button data-action="title">Return to title</button>
        </section>
      </div>
    </div>
  </main>
`;

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
const heldKeys = new Set<string>();
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
type Screen = 'title' | 'loading' | 'playing' | 'paused' | 'settings' | 'help' | 'about' | 'error';
let screen: Screen = 'title';
let panelOrigin: 'title' | 'paused' = 'title';
const snapshotRequests = new Map<number, { resolve: (snapshot: CoreSnapshot) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();

function focusGame(): void { canvas.focus({ preventScroll: true }); }

function showScreen(next: Screen): void {
  screen = next;
  shell.dataset.screen = next;
  const playing = next === 'playing';
  overlay.hidden = playing;
  hud.hidden = !playing;
  gameStage.inert = !playing;
  backButton.hidden = !['settings', 'help', 'about'].includes(next);
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== next;
  });
  if (playing) focusGame();
  else {
    overlay.setAttribute('aria-labelledby', `${next}-heading`);
    const panel = element<HTMLElement>(`[data-panel="${next}"]`);
    panel.tabIndex = -1;
    const focusTarget = panel.querySelector<HTMLElement>('button, a, input') ?? panel;
    focusTarget.focus({ preventScroll: true });
  }
}

function openPanel(panel: 'settings' | 'help' | 'about'): void {
  panelOrigin = ready ? 'paused' : 'title';
  if (ready) pauseGame();
  showScreen(panel);
}

function closePanel(): void { showScreen(panelOrigin); }

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
function sendKeys(): void {
  if (!ready) return;
  send({ type: 'keys', directions: [Number(heldKeys.has('KeyS')) - Number(heldKeys.has('KeyW')),
    Number(heldKeys.has('ArrowDown')) - Number(heldKeys.has('ArrowUp'))] });
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
    pad.style.setProperty('--paddle-position', `${Math.round(fraction * 100)}%`);
    pad.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    pad.setAttribute('aria-disabled', String(!ready || paused || resetting || failed));
    pad.tabIndex = ready && !paused && !resetting && !failed ? 0 : -1;
  });
}

function releaseInputs(): void {
  heldKeys.clear();
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
  if (!['settings', 'help', 'about'].includes(screen)) showScreen('paused');
  updatePads();
  showStatus(message);
}

function resumeGame(): void {
  if (!ready || failed || document.hidden) return;
  // Unlock from this gesture without making play depend on an audio device.
  void trySound();
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
  updatePads();
  clockEpoch += 1;
  framePending = false;
  latestPixels = undefined;
  send({ type: 'reset', id: ++resetId, seed: SEED, epoch: clockEpoch, running: !paused && !document.hidden });
}

function returnToTitle(): void {
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
  showScreen('title');
}

function animationFrame(): void {
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
  function move(event: PointerEvent): void {
    if (pointers.get(event.pointerId) !== slot) return;
    const bounds = pad.getBoundingClientRect();
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
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code === 'Escape' && !event.repeat) {
    if (['settings', 'help', 'about'].includes(screen)) { event.preventDefault(); closePanel(); }
    else if (ready && !failed) { event.preventDefault(); if (paused) resumeGame(); else pauseGame(); }
    return;
  }
  if (!ready || failed) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, select') || target?.isContentEditable) return;
  if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
    if (!paused && !resetting) { event.preventDefault(); heldKeys.add(event.code); sendKeys(); }
    return;
  }
  if (event.repeat) return;
  // Space/Enter retain native button activation while paddle keys work after a click.
  if (target?.closest('button') && ['Space', 'Enter'].includes(event.code)) return;
  // Secondary panels own their keys; a coin shortcut must not dismiss settings
  // or unlock audio from a non-gesture transition back to gameplay.
  if (['settings', 'help', 'about'].includes(screen)) return;
  switch (event.code) {
    case 'Enter': event.preventDefault(); insertCoin(); break;
    case 'Space': event.preventDefault(); if (paused) void resumeGame(); else pauseGame(); break;
    case 'KeyR': event.preventDefault(); resetGame(); break;
    case 'KeyM': event.preventDefault(); muteButton.click(); break;
  }
});
overlay.addEventListener('keydown', (event) => {
  if (event.code !== 'Tab') return;
  const controls = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')]
    .filter((control) => !control.closest<HTMLElement>('[hidden]'));
  if (!controls.length) { event.preventDefault(); return; }
  const index = controls.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)!.focus(); }
  else if (!event.shiftKey && (index === -1 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
});
document.addEventListener('keyup', (event) => { if (heldKeys.delete(event.code)) sendKeys(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame('Paused while you were away.'); });
window.addEventListener('blur', () => { pauseGame('Paused while you were away.'); });
window.addEventListener('pagehide', () => { pauseGame('Paused while you were away.'); releaseInputs(); audio.pause(); });
playButton.addEventListener('click', () => { void startGame(); });
element('#retry').addEventListener('click', () => { void startGame(); });
coinButton.addEventListener('click', insertCoin);
pauseButton.addEventListener('click', () => { if (paused) void resumeGame(); else pauseGame(); });
resumeButton.addEventListener('click', resumeGame);
backButton.addEventListener('click', closePanel);
element('#return-title').addEventListener('click', returnToTitle);
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'title') returnToTitle();
    else if (action === 'settings' || action === 'help' || action === 'about') openPanel(action);
  });
});
resetButton.addEventListener('click', resetGame);
muteButton.addEventListener('click', () => {
  if (!muted && !soundAvailable) { void trySound(); return; }
  muted = !muted;
  audio.setMuted(muted);
  updateSoundButton();
  if (!muted) void trySound();
});
element<HTMLInputElement>('#volume').addEventListener('input', (event) => { audio.setVolume(Number((event.target as HTMLInputElement).value) / 100); });
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
        heldKeys: [...heldKeys], pointerCount: pointers.size, paused, screen,
        audio: { generatedSamples, coreOverruns: state.audioOverruns, transportDroppedSamples: state.audioTransportDroppedSamples, ...audio.metrics() },
        worker: { simulatedUs: Number(BigInt(state.timeps) / 1000000n), steps: workerSteps, totalMs: workerTimeMs, maxMs: workerMaxMs,
          wasmMemoryCapacityBytes: state.wasmMemoryCapacityBytes },
      };
    },
  };
}
