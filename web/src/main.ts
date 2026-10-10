// NoCPU browser frontend, GPL-3.0-or-later. Original DICE circuit engine: DICE Team.
import './style.css';
import { CircuitAudio } from './audio';
import type { CoreCommand, CoreEvent, CoreSnapshot } from './protocol';

const base = import.meta.env.BASE_URL;
const source = `${base}source/nocpu-${__NOCPU_VERSION__}-source.tar.gz`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="${base}" aria-label="NoCPU home"><span class="brand-mark" aria-hidden="true">N<span>•</span></span><span>NoCPU</span></a>
    <span class="header-note">THE CIRCUIT ARCADE</span>
    <a class="source-link" href="https://github.com/jelloshooter848/NoCPU" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
  </header>
  <main>
    <section class="intro" id="intro" aria-labelledby="game-title">
      <div class="intro-copy">
        <span class="eyebrow"><span class="live-dot"></span> FIRST CIRCUIT, NOW PLAYING</span>
        <h1 id="game-title">P<span class="pong-o">O</span>NG<span class="title-dot">.</span></h1>
        <p class="lead">Two paddles. One ball.<br />An arcade classic, down to the circuit.</p>
        <p class="description">NoCPU brings DICE’s original arcade simulation to your browser. Grab a friend and keep the ball in play.</p>
        <div class="game-tags"><span>2 PLAYERS</span><span>KEYBOARD + TOUCH</span><span>NO ROM NEEDED</span></div>
        <button class="primary-button play-button" data-testid="play-pong">Play Pong <span aria-hidden="true">→</span></button>
        <p class="start-note">Free to play. No download. Sound starts with your tap.</p>
        <p class="preview-note" id="release-stage">Browser preview · phone testing in progress</p>
      </div>
      <div class="intro-art" aria-hidden="true">
        <div class="art-top"><span>PONG / 1972</span><span>01</span></div>
        <svg class="pong-art" viewBox="0 0 400 300"><path class="court" d="M200 15v270"/><path class="paddles" d="M65 60v60M335 170v60"/><rect class="ball" x="259" y="132" width="10" height="10"/><path class="trail" d="m190 115 59 17"/><text x="140" y="60">0</text><text x="236" y="60">0</text></svg>
        <div class="art-bottom"><span>DISCRETE LOGIC</span><span>∞ QUARTERS</span></div>
      </div>
    </section>
    <section class="arcade" id="arcade" hidden aria-label="Pong arcade">
      <div class="game-heading"><div><span class="eyebrow">NOW PLAYING</span><h1>Pong</h1></div><div class="game-status"><span class="live-dot"></span><span data-testid="status" role="status" aria-live="polite">Loading Pong…</span></div></div>
      <div class="error-panel" data-testid="error" role="alert" hidden><p id="error-message"></p><button class="primary-button" id="retry">Reload game</button></div>
      <div class="game-layout">
        <div class="screen-column">
          <div class="screen-frame"><canvas data-testid="game-canvas" width="576" height="432" aria-label="Pong game display. Use the player controls below to move the paddles."></canvas><div class="screen-overlay" id="screen-overlay"><span id="overlay-label">Loading Pong…</span></div></div>
          <div class="score-strip" aria-label="Score"><span>PLAYER 1 <strong data-testid="score-p1">0</strong></span><span class="score-caption">FIRST TO 11</span><span><strong data-testid="score-p2">0</strong> PLAYER 2</span></div>
          <div class="touch-controls" aria-label="Touch paddle controls">
            <div class="paddle-control" data-testid="paddle-p1" tabindex="0" role="slider" aria-label="Player 1 paddle position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-orientation="vertical"><span class="control-player">PLAYER 1</span><span class="control-track"><span class="control-thumb"></span></span><span class="control-help">DRAG UP / DOWN</span></div>
            <div class="touch-middle" aria-hidden="true">↕<span>KEEP IT<br />IN PLAY</span></div>
            <div class="paddle-control" data-testid="paddle-p2" tabindex="0" role="slider" aria-label="Player 2 paddle position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-orientation="vertical"><span class="control-player">PLAYER 2</span><span class="control-track"><span class="control-thumb"></span></span><span class="control-help">DRAG UP / DOWN</span></div>
          </div>
        </div>
        <aside class="control-panel" aria-label="Game controls">
          <button class="primary-button" data-testid="insert-coin" disabled>Insert coin / Start <span aria-hidden="true">↗</span></button>
          <p class="coin-help">One coin starts a two-player game.</p>
          <div class="secondary-controls"><button data-testid="pause" aria-pressed="false" disabled>Pause</button><button data-testid="reset" disabled>Reset</button></div>
          <div class="sound-control"><button data-testid="mute" aria-pressed="false" aria-label="Mute sound">Sound on</button><label class="volume-label" for="volume">Volume</label><input id="volume" type="range" min="0" max="100" value="60" aria-label="Volume" /></div>
          <p id="sound-note" class="sound-note" hidden>Sound is unavailable. You can keep playing. Tap Enable sound to try again.</p>
          <details class="how-to" open><summary>How to play</summary><p>Move your paddle to return the ball. A missed ball gives the other player a point.</p><dl><div><dt>Player 1</dt><dd><kbd>W</kbd> <kbd>S</kbd></dd></div><div><dt>Player 2</dt><dd><kbd>↑</kbd> <kbd>↓</kbd></dd></div><div><dt>Coin / start</dt><dd><kbd>Enter</kbd></dd></div><div><dt>Pause</dt><dd><kbd>Space</kbd></dd></div></dl><p class="touch-hint">On a phone, each player drags their own paddle control. You can use both at once.</p></details>
        </aside>
      </div>
    </section>
  </main>
  <footer class="site-footer"><div>A continuation of <a href="https://sourceforge.net/projects/dice/" target="_blank" rel="noopener noreferrer">DICE</a>, by the DICE Team.</div><div class="footer-links"><span data-testid="version">v${__NOCPU_VERSION__} <span class="build-id" id="build-id">development</span></span><span id="footer-stage">Preview</span><a href="${source}" target="_blank" rel="noopener noreferrer">Source</a><a href="${base}notices/LICENSE">GPL v3</a><a href="${base}notices/THIRD_PARTY_NOTICES.md">Credits & notices</a></div></footer>
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
  element('#footer-stage').hidden = metadata.stage === 'release';
}).catch(() => { /* Local development or offline metadata: retain the preview label. */ });
const playButton = element<HTMLButtonElement>('[data-testid="play-pong"]');
const coinButton = element<HTMLButtonElement>('[data-testid="insert-coin"]');
const pauseButton = element<HTMLButtonElement>('[data-testid="pause"]');
const resetButton = element<HTMLButtonElement>('[data-testid="reset"]');
const muteButton = element<HTMLButtonElement>('[data-testid="mute"]');
const status = element('[data-testid="status"]');
const overlay = element('#screen-overlay');
const overlayLabel = element('#overlay-label');
const canvas = element<HTMLCanvasElement>('[data-testid="game-canvas"]');
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
const snapshotRequests = new Map<number, { resolve: (snapshot: CoreSnapshot) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();

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
  pauseButton.textContent = 'Resume';
  pauseButton.setAttribute('aria-pressed', 'true');
  overlay.hidden = false;
  overlayLabel.textContent = 'Paused';
  updatePads();
  showStatus(message);
}

function resumeGame(): void {
  if (!ready || failed || document.hidden) return;
  // Unlock from this gesture without making play depend on an audio device.
  void trySound();
  paused = false;
  setClock(true);
  pauseButton.textContent = 'Pause';
  pauseButton.setAttribute('aria-pressed', 'false');
  overlay.hidden = true;
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
  element('[data-testid="error"]').hidden = false;
  element('#error-message').textContent = message;
  overlay.hidden = false;
  overlayLabel.textContent = 'Unable to load Pong';
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
  element('#intro').hidden = true;
  element('#arcade').hidden = false;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  element('[data-testid="error"]').hidden = true;
  overlay.hidden = false;
  overlayLabel.textContent = 'Loading Pong…';
  showStatus();
  coinButton.disabled = true;
  pauseButton.disabled = true;
  pauseButton.textContent = 'Pause';
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
        overlay.hidden = true;
        updatePads();
        acceptSnapshot(message.snapshot);
        if (document.hidden || !document.hasFocus()) pauseGame();
        else setClock(true);
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
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  // Original hardware needs an initial settled interval; the first press is retained.
  if (paused) resumeGame();
  else void trySound();
  send({ type: 'coin' });
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
    if (!ready || paused || failed || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.code)) return;
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
  if (!ready || failed || event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, select') || target?.isContentEditable) return;
  if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
    if (!paused && !resetting) { event.preventDefault(); heldKeys.add(event.code); sendKeys(); }
    return;
  }
  if (event.repeat) return;
  // Space/Enter retain native button activation while paddle keys work after a click.
  if (target?.closest('button') && ['Space', 'Enter'].includes(event.code)) return;
  switch (event.code) {
    case 'Enter': event.preventDefault(); insertCoin(); break;
    case 'Space': event.preventDefault(); if (paused) void resumeGame(); else pauseGame(); break;
    case 'KeyR': event.preventDefault(); resetGame(); break;
    case 'KeyM': event.preventDefault(); muteButton.click(); break;
  }
});
document.addEventListener('keyup', (event) => { if (heldKeys.delete(event.code)) sendKeys(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame('Paused while you were away.'); });
window.addEventListener('blur', () => { pauseGame('Paused while you were away.'); });
window.addEventListener('pagehide', () => { pauseGame('Paused while you were away.'); releaseInputs(); audio.pause(); });
playButton.addEventListener('click', () => { void startGame(); });
element('#retry').addEventListener('click', () => { void startGame(); });
coinButton.addEventListener('click', insertCoin);
pauseButton.addEventListener('click', () => { if (paused) void resumeGame(); else pauseGame(); });
resetButton.addEventListener('click', resetGame);
muteButton.addEventListener('click', () => {
  if (!muted && !soundAvailable) { void trySound(); return; }
  muted = !muted;
  audio.setMuted(muted);
  updateSoundButton();
  if (!muted) void trySound();
});
element<HTMLInputElement>('#volume').addEventListener('input', (event) => { audio.setVolume(Number((event.target as HTMLInputElement).value) / 100); });
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
        heldKeys: [...heldKeys], pointerCount: pointers.size, paused,
        audio: { generatedSamples, coreOverruns: state.audioOverruns, transportDroppedSamples: state.audioTransportDroppedSamples, ...audio.metrics() },
        worker: { simulatedUs: Number(BigInt(state.timeps) / 1000000n), steps: workerSteps, totalMs: workerTimeMs, maxMs: workerMaxMs,
          wasmMemoryCapacityBytes: state.wasmMemoryCapacityBytes },
      };
    },
  };
}
