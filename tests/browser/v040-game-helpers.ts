// SPDX-License-Identifier: GPL-3.0-or-later
// Black-box UI/native observations; no circuit state or media is injected.
import { expect, type Page } from '@playwright/test';
import type { GameOptions, PlayableGameId } from '../../web/src/game-contract';

export interface GameObservation {
  gameId: PlayableGameId; options: GameOptions; generation: number; resetId: number; clockEpoch: number;
  timeps: string; frame: number; hits: number | null; crashes: [number, number] | null;
  scores: [number, number]; run: boolean; attract: boolean | null; axes: number[]; directions: number[];
  coin: boolean; start: boolean; heldKeys: string[]; pointerCount: number; paused: boolean;
  audio: { generatedSamples: number; [key: string]: number | string };
}
export async function gameSnapshot(page: Page): Promise<GameObservation> {
  return page.evaluate(async () => {
    const state = await (window as any).__nocpuDebug.snapshot();
    return { gameId: state.gameId, options: state.gameOptions, generation: state.identity.generation,
      resetId: state.identity.resetId, clockEpoch: state.identity.clockEpoch,
      timeps: state.timePs, frame: state.frame, hits: state.hits, crashes: state.crashes,
      scores: state.scores, run: state.nativeRunning, attract: state.attractN === null ? null : state.attractN === 0,
      axes: state.gameId === 'spacerace' ? [] : [state.inputs.paddle1, state.inputs.paddle2,
        ...(state.gameId === 'pongdoubles' ? [state.inputs.paddle3, state.inputs.paddle4] : [])],
      directions: state.inputs.directions, coin: state.inputs.coin !== 0, start: state.inputs.start !== 0,
      heldKeys: state.heldKeys, pointerCount: state.pointerCount, paused: state.paused, audio: state.audio };
  });
}
export async function waitGameTime(page: Page, target: bigint): Promise<void> {
  await expect.poll(async () => BigInt((await gameSnapshot(page)).timeps) >= target, { timeout: 30_000 }).toBe(true);
}
export async function advanceGame(page: Page, microseconds: number): Promise<void> {
  const state = await gameSnapshot(page);
  await waitGameTime(page, BigInt(state.timeps) + BigInt(microseconds) * 1_000_000n);
}
export async function launchFromLibrary(page: Page, gameId: PlayableGameId, initial: boolean | 'library' = true): Promise<void> {
  if (initial === true) { await page.goto('./?debug'); await page.getByTestId('open-library').click(); }
  else if (initial !== 'library') {
    const state = await gameSnapshot(page);
    if (!state.paused) await page.getByTestId('pause').click();
    await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
    await page.getByTestId('return-library').click();
  }
  await page.getByTestId(`game-${gameId}`).click();
  await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect.poll(async () => (await gameSnapshot(page)).gameId).toBe(gameId);
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  await waitGameTime(page, 800_000_000_000n);
}
export async function activateGame(page: Page, gameId: PlayableGameId): Promise<void> {
  await page.getByTestId('insert-coin').click();
  if (gameId === 'pongdoubles') {
    // Original Doubles has a distinct four-player credit/start configuration.
    // These are two user coin presses, never a synthetic circuit mode change.
    await page.getByTestId('insert-coin').click();
  }
  if (gameId !== 'pong') await page.getByTestId('start-game').click();
  await expect.poll(async () => (await gameSnapshot(page)).run, { timeout: 30_000 }).toBe(true);
  await advanceGame(page, 150000);
}
export async function gamePause(page: Page): Promise<void> {
  if (!(await gameSnapshot(page)).paused) await page.getByTestId('pause').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
}
export async function gameSettings(page: Page): Promise<void> {
  await gamePause(page); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'settings');
}
export async function resumeFromSettings(page: Page): Promise<void> {
  await page.getByTestId('back').click(); await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await page.getByTestId('resume').click(); await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
}
export async function installFourGamepads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as any;
    target.__testPads = Array.from({ length: 4 }, (_, index) => ({ index, id: `Synthetic platform controller ${index + 1}`,
      connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 32 }, () => ({ pressed: false, touched: false, value: 0 })) }));
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => target.__testPads });
  });
}
/** Original DICE calibration, not CSS geometry or worker-reported input values.
 * Doubles: build/reference-games/20261011T054438379290328Z/pongdoubles-default/baseline/epoch0/6500ms.ppm
 * and calibration-hardware.json, two separate coins before Start. Space motion:
 * build/reference-games/20261011T055400597425800Z/calibration-short-directions.json.
 * Doubles fixed columns are isolated from original score glyphs: both baseline
 * and build/reference-games/20261011T060201757660291Z-options-calibration/pongdoubles-15/baseline/epoch0/15000ms.ppm
 * preserve 25–27 px paddles in strips75..79,469..474,174..178,371..375.
 * Whole-frame components would merge P2/P3 with adjacent original score digits
 * at the upper endpoint; only the authentic paddle columns belong to this ROI.
 * Source slot
 * order is outer-left, outer-right, inner-left, inner-right. Original Space
 * Race rocket glyphs are 15–40 px high; its 55 px score zeros are excluded.
 */
export async function renderedGameObjects(page: Page, gameId: 'pongdoubles' | 'spacerace'): Promise<{ x: number; y: number; width: number; height: number; area: number }[]> {
  return page.getByTestId('game-canvas').evaluate((element, gameId) => {
    const canvas = element as HTMLCanvasElement, { width, height } = canvas;
    if (width !== 576 || height !== 432) throw new Error('Unexpected original circuit raster dimensions');
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    function componentsWithin(left: number, right: number) {
      const visited = new Uint8Array(width * height);
      const components: { x: number; y: number; width: number; height: number; area: number }[] = [];
      for (let row = 0; row < height; row++) for (let column = left; column <= right; column++) {
        const initial = row * width + column;
        if (visited[initial] || rgba[initial * 4] < 150) continue;
        visited[initial] = 1; const stack = [initial]; let count = 0, sx = 0, sy = 0;
        let minX = width, minY = height, maxX = 0, maxY = 0;
        while (stack.length) {
          const pixel = stack.pop()!, x = pixel % width, y = Math.floor(pixel / width);
          count++; sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          // Eight-way adjacency preserves diagonal rocket glyph fragments.
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || x + dx < left || x + dx > right || y + dy < 0 || y + dy >= height) continue;
            const next = (y + dy) * width + x + dx;
            if (!visited[next] && rgba[next * 4] >= 150) { visited[next] = 1; stack.push(next); }
          }
        }
        components.push({ x: sx / count, y: sy / count, width: maxX - minX + 1, height: maxY - minY + 1, area: count });
      }
      return components;
    }
    const bands = gameId === 'pongdoubles' ? [[60, 95], [450, 495], [155, 195], [355, 390]] : [[172, 200], [345, 373]];
    const originalPaddleColumns = [[75, 79], [469, 474], [174, 178], [371, 375]];
    const wholeFrame = gameId === 'spacerace' ? componentsWithin(0, width - 1) : undefined;
    return bands.map(([left, right], slot) => {
      const components = wholeFrame ?? componentsWithin(originalPaddleColumns[slot][0], originalPaddleColumns[slot][1]);
      const candidates = components.filter((part) => part.x >= left && part.x <= right && part.height >= 15 && part.height <= 40
        && (gameId === 'pongdoubles' ? part.width >= 1 && part.width <= 8 : part.width >= 12 && part.width <= 30));
      if (!candidates.length) throw new Error(`No original-shaped ${gameId === 'pongdoubles' ? 'paddle' : 'rocket'} ${slot + 1}`);
      candidates.sort((a, b) => b.area - a.area); return candidates[0];
    });
  }, gameId);
}
export async function initialGameObjects(page: Page, gameId: 'pongdoubles' | 'spacerace'): Promise<Awaited<ReturnType<typeof renderedGameObjects>>> {
  let observed: Awaited<ReturnType<typeof renderedGameObjects>> | undefined;
  await expect.poll(async () => {
    try { observed = await renderedGameObjects(page, gameId); return true; }
    catch (error) { if (!(error instanceof Error) || !error.message.includes('No original-shaped')) throw error; return false; }
  }, { timeout: 15_000, message: 'Every original-shaped player object must be present in real circuit output' }).toBe(true);
  return observed!;
}

/** Bracket visible original rocket sprites with native state observations.
 * Reject any clock/session/activity or crash-counter discontinuity rather than
 * counting a collision reset as joystick movement.
 */
export interface RocketObservationEvidence {
  before: GameObservation; after?: GameObservation;
  objects?: Awaited<ReturnType<typeof renderedGameObjects>>;
  reference: GameObservation; accepted: boolean; missingSprite?: string;
}
export async function continuousRocketObservation(page: Page, baseline?: GameObservation,
  record?: (observation: RocketObservationEvidence) => void): Promise<{
  before: GameObservation; after: GameObservation; objects: Awaited<ReturnType<typeof renderedGameObjects>>;
} | null> {
  const before = await gameSnapshot(page);
  let objects: Awaited<ReturnType<typeof renderedGameObjects>>;
  try { objects = await renderedGameObjects(page, 'spacerace'); }
  catch (error) {
    if (error instanceof Error && error.message.includes('No original-shaped')) {
      record?.({ before, reference: baseline ?? before, accepted: false, missingSprite: error.message });
      return null;
    }
    throw error;
  }
  const after = await gameSnapshot(page), reference = baseline ?? before;
  const same = (state: GameObservation) => state.gameId === 'spacerace' && state.run && !state.paused
    && state.generation === reference.generation && state.resetId === reference.resetId && state.clockEpoch === reference.clockEpoch
    && JSON.stringify(state.crashes) === JSON.stringify(reference.crashes);
  const accepted = same(before) && same(after);
  record?.({ before, after, reference, objects, accepted });
  return accepted ? { before, after, objects } : null;
}

/** Source-calibrated, ordinary-UI Space trajectory with all timing observations
 * local to the page. Synthetic DOM events are explicitly labelled; later
 * browser-driver keyboard, pointer and controller cases remain independent.
 * The detector body duplicates the accepted original-pixel oracle unchanged
 * to keep existing Doubles rendering/control paths byte-identical.
 * Candidate original trajectory evidence: build/v040/space-motion-exploration-v4-actual-v2.
 */
interface SpaceMovementNativeState extends GameObservation { resetting: boolean; ready: boolean; failed: boolean; }
export async function sourceCalibratedSpaceMovement(page: Page) {
  return page.evaluate(async () => {
    const observations: unknown[] = [], events: unknown[] = [];
    const coinSamples: { phase: string; state: SpaceMovementNativeState }[] = [];
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]')!;
    let lastNative: SpaceMovementNativeState | undefined;
    const read = async (): Promise<SpaceMovementNativeState> => {
      const state = await (window as any).__nocpuDebug.snapshot();
      const observation: SpaceMovementNativeState = { gameId: state.gameId, options: state.gameOptions, generation: state.identity.generation,
        resetting: state.identity.resetting, ready: state.identity.ready, failed: state.identity.failed,
        resetId: state.identity.resetId, clockEpoch: state.identity.clockEpoch,
        timeps: state.timePs, frame: state.frame, hits: state.hits, crashes: state.crashes,
        scores: state.scores, run: state.nativeRunning, attract: state.attractN === null ? null : state.attractN === 0,
        axes: [], directions: state.inputs.directions, coin: state.inputs.coin !== 0, start: state.inputs.start !== 0,
        heldKeys: state.heldKeys, pointerCount: state.pointerCount, paused: state.paused, audio: state.audio };
      lastNative = observation; return observation;
    };
    const detect = (element: Element, gameId: 'pongdoubles' | 'spacerace') => {
    const canvas = element as HTMLCanvasElement, { width, height } = canvas;
    if (width !== 576 || height !== 432) throw new Error('Unexpected original circuit raster dimensions');
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    function componentsWithin(left: number, right: number) {
      const visited = new Uint8Array(width * height);
      const components: { x: number; y: number; width: number; height: number; area: number }[] = [];
      for (let row = 0; row < height; row++) for (let column = left; column <= right; column++) {
        const initial = row * width + column;
        if (visited[initial] || rgba[initial * 4] < 150) continue;
        visited[initial] = 1; const stack = [initial]; let count = 0, sx = 0, sy = 0;
        let minX = width, minY = height, maxX = 0, maxY = 0;
        while (stack.length) {
          const pixel = stack.pop()!, x = pixel % width, y = Math.floor(pixel / width);
          count++; sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          // Eight-way adjacency preserves diagonal rocket glyph fragments.
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || x + dx < left || x + dx > right || y + dy < 0 || y + dy >= height) continue;
            const next = (y + dy) * width + x + dx;
            if (!visited[next] && rgba[next * 4] >= 150) { visited[next] = 1; stack.push(next); }
          }
        }
        components.push({ x: sx / count, y: sy / count, width: maxX - minX + 1, height: maxY - minY + 1, area: count });
      }
      return components;
    }
    const bands = gameId === 'pongdoubles' ? [[60, 95], [450, 495], [155, 195], [355, 390]] : [[172, 200], [345, 373]];
    const originalPaddleColumns = [[75, 79], [469, 474], [174, 178], [371, 375]];
    const wholeFrame = gameId === 'spacerace' ? componentsWithin(0, width - 1) : undefined;
    return bands.map(([left, right], slot) => {
      const components = wholeFrame ?? componentsWithin(originalPaddleColumns[slot][0], originalPaddleColumns[slot][1]);
      const candidates = components.filter((part) => part.x >= left && part.x <= right && part.height >= 15 && part.height <= 40
        && (gameId === 'pongdoubles' ? part.width >= 1 && part.width <= 8 : part.width >= 12 && part.width <= 30));
      if (!candidates.length) throw new Error(`No original-shaped ${gameId === 'pongdoubles' ? 'paddle' : 'rocket'} ${slot + 1}`);
      candidates.sort((a, b) => b.area - a.area); return candidates[0];
    });
    };
    const millis = (ms: number) => BigInt(ms) * 1_000_000_000n;
    const now = (s: GameObservation) => BigInt(s.timeps);
    const sleep = () => new Promise<void>(resolve => setTimeout(resolve, 10));
    const check = (valid: boolean, reason: string) => { if (!valid) throw new Error(reason); };
    const debug = (window as any).__nocpuDebug;
    let reference: SpaceMovementNativeState | undefined;
    const continuous = (state: GameObservation) => state.gameId === 'spacerace' && state.run && !state.paused
      && (!reference || (state.generation === reference.generation && state.resetId === reference.resetId
        && state.clockEpoch === reference.clockEpoch && JSON.stringify(state.options) === JSON.stringify(reference.options)
        && JSON.stringify(state.crashes) === JSON.stringify(reference.crashes)));
    // The whole trajectory runs on the debug clock: the worker's wall-clock
    // pacing is held and the circuit advances only by explicit simulated steps.
    // Every phase, input edge and raster below therefore sits at an exact
    // circuit time, however slowly or unevenly the host runs (CI WebKit stalls
    // of 100-200 ms used to land edges outside the circuit-time envelope).
    // Wall-clock limits only bound waiting for the browser to answer.
    let held = false, sampling = false;
    const observeEvery = 10_000, rasterEvery = 50_000;
    const rasterSamples: { phase: string; before: SpaceMovementNativeState; after: SpaceMovementNativeState; objects: ReturnType<typeof detect> }[] = [];
    let scheduledPhase = 'cold';
    const step = async (microseconds: number) => {
      check(held, 'Simulated steps require the held debug clock');
      await debug.stepClock(microseconds);
    };
    // Waits for a native state. A 'simulated' wait advances the circuit in 10 ms
    // steps within a simulated budget; an 'acknowledge' wait spends no circuit
    // time and only waits for the page and worker to answer.
    const wait = async (phase: string, condition: (state: SpaceMovementNativeState) => boolean,
      mode: 'simulated' | 'acknowledge' = 'simulated'): Promise<SpaceMovementNativeState> => {
      const wallDeadline = performance.now() + 30000;
      let limit: bigint | undefined;
      while (true) {
        const state = await read(); observations.push({ phase, state });
        if (phase === 'coin_held' || phase === 'coin_released') coinSamples.push({ phase, state });
        if (reference) check(continuous(state), 'Session/activity/crash discontinuity during ' + phase);
        if (condition(state)) return state;
        if (mode === 'simulated') {
          limit ??= now(state) + millis(10000);
          check(now(state) < limit, 'Simulated observation budget exceeded during ' + phase);
          await step(observeEvery);
        } else {
          check(performance.now() < wallDeadline, 'No acknowledgment from the page during ' + phase);
          await sleep();
        }
      }
    };
    const key = (kind: 'keydown' | 'keyup', code: string) => {
      const value = code === 'KeyW' ? 'w' : code === 'KeyS' ? 's' : code;
      const event = new KeyboardEvent(kind, { key: value, code, bubbles: true, cancelable: true });
      events.push({ kind, code, isTrusted: event.isTrusted, wallMs: performance.now() });
      canvas.dispatchEvent(event);
    };
    // The canvas shows the frame the worker last handed over on an animation
    // frame. With the clock held, wait until it presents the current circuit
    // frame, so each raster belongs to the bracketing native time.
    const present = async (phase: string) => {
      const wallDeadline = performance.now() + 30000;
      while (true) {
        const state = await debug.snapshot();
        if (state.presentedFrame === state.frame) return;
        check(performance.now() < wallDeadline, 'The current circuit frame was never presented during ' + phase);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    };
    const bracket = async (phase: string) => {
      const before = await read();
      await present(phase);
      let objects: ReturnType<typeof detect> | undefined, failure: string | undefined;
      try { objects = detect(canvas, 'spacerace'); } catch (error) { failure = String(error); }
      const after = await read(), accepted = continuous(before) && continuous(after) && Boolean(objects) && now(before) === now(after);
      const observation = { phase, before, after, objects, failure, accepted };
      observations.push(observation);
      check(accepted, 'Rejected original rocket bracket ' + phase);
      return observation as typeof observation & { objects: ReturnType<typeof detect> };
    };
    // Advance exactly to a requested circuit time. While sampling, a raster is
    // bracketed at every 50 ms of circuit time on the way; it costs no circuit time.
    const advanceTo = async (target: bigint) => {
      while (true) {
        const state = await read();
        if (now(state) >= target) return state;
        const remaining = Number((target - now(state)) / 1_000_000n);
        await step(Math.max(1, Math.min(remaining, rasterEvery)));
        if (sampling) {
          const observation = await bracket('raster_during_' + scheduledPhase);
          rasterSamples.push({ phase: observation.phase, before: observation.before, after: observation.after, objects: observation.objects });
        }
      }
    };
    const at = async (phase: string, target: bigint, heldDirections?: readonly number[]) => {
      scheduledPhase = phase;
      const state = await advanceTo(target);
      if (heldDirections) check(JSON.stringify(state.directions) === JSON.stringify(heldDirections),
        'Expected digital direction was lost during held native observations');
      observations.push({ phase: 'scheduled_phase_observation', requestedPhase: phase, targetPs: target.toString(), state,
        overshootPs: (now(state) - target).toString() });
      return state;
    };
    const click = (id: string) => {
      const button = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
      const bounds = button?.getBoundingClientRect();
      check(Boolean(button && !button.disabled && bounds.width && bounds.height && !button.closest('[hidden]')), 'Ordinary control unavailable: ' + id);
      check(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest('button') === button, 'Ordinary control occluded: ' + id);
      events.push({ kind: 'button_click', target: id, isTrusted: false, wallMs: performance.now() }); button.click();
    };
    let loaded: SpaceMovementNativeState | undefined, reset: SpaceMovementNativeState | undefined;
    let coinHeld: SpaceMovementNativeState | undefined, coinReleased: SpaceMovementNativeState | undefined;
    let failure: string | undefined;
    try {
      loaded = await read();
      click('pause'); click('reset');
      reset = await wait('fresh_reset', state => state.resetId === loaded!.resetId + 1 && state.clockEpoch !== loaded!.clockEpoch
        && !state.resetting && state.ready && !state.failed && state.paused, 'acknowledge');
      check(reset.generation === loaded.generation && now(reset) === 0n, 'Visible Reset did not acknowledge a fresh same-module native clock');
      await debug.holdClock(true); held = true;
      click('resume'); click('insert-coin');
      const queued = await wait('coin_queued_before_guard', state => !state.paused, 'acknowledge');
      check(now(queued) < millis(500), 'Initial post-reset Coin window missed');
      coinHeld = await wait('coin_held', state => state.coin);
      coinReleased = await wait('coin_released', state => !state.coin);
      // Observations are 10 ms of circuit time apart, not switch edges.
      // Keep the measured transition brackets separate from source-derived500/600ms edges.
      const lastFalse = [...coinSamples].reverse().find(sample => !sample.state.coin && now(sample.state) <= now(coinHeld!))?.state;
      const lastTrue = [...coinSamples].reverse().find(sample => sample.state.coin && now(sample.state) <= now(coinReleased!))?.state;
      observations.push({ phase: 'coin_transition_brackets', sourceHeldEdgePs: millis(500).toString(), sourceReleaseEdgePs: millis(600).toString(),
        lastFalse, firstTrue: coinHeld, lastTrue, firstFalse: coinReleased, exactEdgesDirectlyObserved: false });
      check(now(coinHeld) >= millis(500) && now(coinHeld) < millis(600), 'Coin held observation outside original held window');
      check(now(coinReleased) >= millis(600) && now(coinReleased) < millis(700), 'Coin release observation outside original released window');
      check(Boolean(lastFalse && now(lastFalse) <= millis(500) && now(coinHeld) >= millis(500)), 'Observed Coin-on transition did not bracket the source guard');
      check(Boolean(lastTrue && now(lastTrue) < millis(600) && now(coinReleased) >= millis(600)), 'Observed Coin-off transition did not bracket the source release');
      const anchor = 0n;
      await at('start_phase', millis(1000)); click('start-game');
      reference = await wait('active', state => state.run);
      await at('cold_phase', millis(1800));
      const cold = await bracket('cold');
      check(cold.before.directions.every(direction => direction === 0) && cold.after.directions.every(direction => direction === 0),
        'The fixed cold raster must precede movement with both digital channels neutral');
      sampling = true;
      // Native time at which each slot's held Down was first acknowledged.
      const loweringFrom: (bigint | undefined)[] = [undefined, undefined];
      for (const [slot, upMs, downMs] of [[0, 2000, 2400], [1, 3200, 3600]] as const) {
        const pulse = async (direction: -1 | 1, phaseMs: number) => {
          const code = slot === 0 ? (direction < 0 ? 'KeyW' : 'KeyS') : (direction < 0 ? 'ArrowUp' : 'ArrowDown');
          const expected = slot === 0 ? [direction, 0] : [0, direction];
          const nominalBegin = anchor + millis(phaseMs), nominalEnd = anchor + millis(phaseMs + 300);
          // Nine original timing corners and fresh repeats calibrate this
          // finite envelope: build/v040/space-timing-envelope-actual-v1.
          // Each actual browser still requires its own bracket/pixel/crash
          // proof; this does not guarantee asynchronous input latency or
          // establish safety of every interior trajectory.
          const maximumOffset = millis(100), minimumHold = millis(250), maximumHold = millis(400);
          const lastNeutral = await at(`p${slot + 1}_${direction < 0 ? 'up' : 'down'}_begin`, nominalBegin);
          check(lastNeutral.directions.every(value => value === 0), 'Unexpected direction before ordinary keydown');
          let firstHeld: GameObservation | undefined, lastHeld: GameObservation | undefined, firstNeutral: GameObservation | undefined;
          try {
            key('keydown', code);
            firstHeld = await wait('held_ack', state => {
              check(state.directions.every((value, index) => value === 0 || value === expected[index]), 'Unexpected direction before held acknowledgment');
              return JSON.stringify(state.directions) === JSON.stringify(expected);
            }, 'acknowledge');
            check(now(lastNeutral) >= nominalBegin && now(firstHeld) <= nominalBegin + maximumOffset,
              'Actual keydown apply bracket exceeds the original-calibrated envelope');
            // Release at the nominal end, or later if the acknowledgment came
            // late, so the proven hold (lastHeld - firstHeld) reaches the
            // calibrated minimum. Both targets are circuit times.
            const releaseAt = now(firstHeld) + minimumHold > nominalEnd ? now(firstHeld) + minimumHold : nominalEnd;
            lastHeld = await at(`p${slot + 1}_pulse_end`, releaseAt, expected);
            check(JSON.stringify(lastHeld.directions) === JSON.stringify(expected), 'Expected digital direction was lost before ordinary keyup');
          } finally {
            key('keyup', code);
            try { firstNeutral = await wait('neutral_ack', state => {
              check(state.directions.every((value, index) => value === 0 || value === expected[index]), 'Unexpected direction before neutral acknowledgment');
              return state.directions.every(value => value === 0);
            }, 'acknowledge'); }
            finally {
              observations.push({ phase: 'native_input_apply_brackets', slot, direction,
                nominalBeginPs: nominalBegin.toString(), nominalEndPs: nominalEnd.toString(),
                lastNeutral, firstHeld, lastHeld, firstNeutral,
                conservativeHeldDurationPs: firstHeld && lastHeld && firstNeutral ? [
                  (now(lastHeld) - now(firstHeld)).toString(), (now(firstNeutral) - now(lastNeutral)).toString(),
                ] : null,
              });
            }
          }
          check(Boolean(firstHeld && lastHeld && firstNeutral), 'Missing native input-apply bracket');
          if (direction > 0) loweringFrom[slot] = now(firstHeld!);
          check(now(lastNeutral) <= now(firstHeld!) && now(firstHeld!) <= now(lastHeld!) && now(lastHeld!) <= now(firstNeutral!),
            'Native input-apply bracket timestamps are not ordered');
          check(now(lastHeld!) >= nominalEnd && now(firstNeutral!) <= nominalEnd + maximumOffset,
            'Actual keyup apply bracket exceeds the original-calibrated envelope');
          check(now(lastHeld!) - now(firstHeld!) >= minimumHold && now(firstNeutral!) - now(lastNeutral) <= maximumHold,
            'Conservative actual held-duration interval exceeds the original-calibrated envelope');
        };
        await pulse(-1, upMs);
        await pulse(1, downMs);
      }
      // Every calibrated input edge is complete. Visible evidence, in bracket
      // order: a pose more than 25 px above the cold raster, then a pose more
      // than 5 px below the highest pose seen since, presented after that
      // slot's Down was acknowledged.
      const motion = (slot: number) => {
        let raised: typeof rasterSamples[number] | undefined, peak: typeof raised, lowered: typeof raised;
        for (const entry of rasterSamples) {
          const y = entry.objects[slot].y;
          if (!raised) { if (cold.objects[slot].y - y > 25) raised = peak = entry; continue; }
          if (y < peak!.objects[slot].y) peak = entry;
          if (loweringFrom[slot] !== undefined && now(entry.before) >= loweringFrom[slot]! && y - peak!.objects[slot].y > 5) { lowered = entry; break; }
        }
        return { raised, peak, lowered };
      };
      const complete = () => [0, 1].every(slot => motion(slot).lowered);
      scheduledPhase = 'settled';
      const settledLimit = now(await read()) + millis(1000);
      while (!complete()) {
        const state = await read();
        check(now(state) < settledLimit, 'Original-raster predicate budget exceeded during ' + [0, 1].map(slot => {
          const { raised, lowered } = motion(slot); return `p${slot + 1}_${!raised ? 'raised' : !lowered ? 'lowered' : 'done'}`; }).join('/'));
        await advanceTo(now(state) + BigInt(rasterEvery) * 1_000_000n);
      }
      sampling = false;
      for (const slot of [0, 1]) {
        const { raised, peak, lowered } = motion(slot);
        observations.push({ phase: `p${slot + 1}_visible_motion`, coldY: cold.objects[slot].y,
          raised: { phase: raised!.phase, y: raised!.objects[slot].y, beforePs: raised!.before.timeps, afterPs: raised!.after.timeps },
          peak: { phase: peak!.phase, y: peak!.objects[slot].y, beforePs: peak!.before.timeps, afterPs: peak!.after.timeps },
          lowered: { phase: lowered!.phase, y: lowered!.objects[slot].y, beforePs: lowered!.before.timeps, afterPs: lowered!.after.timeps },
          downAcknowledgedPs: loweringFrom[slot]!.toString() });
      }
    } catch (error) { failure = String(error); }
    finally {
      sampling = false;
      for (const code of ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown']) key('keyup', code);
      // Return the circuit to ordinary wall-clock pacing for the rest of the test.
      if (held) { try { await debug.holdClock(false); } catch (error) { failure ??= 'Debug clock release failed: ' + String(error); } }
    }
    return { stage: 'software motion assertion', physicalQualification: false, inputSource: 'synthetic DOM events; isTrusted=false; actual application handlers',
      phaseLimit: 'Ordinary fresh Reset anchors native time. Start/cold requested phases are state observations, not exact switch edges. Every motion on/off apply bracket and conservative held-duration interval must fit the independently calibrated empirical envelope; delayed phases or changed session/options/crashes never silently qualify. The circuit runs on the held debug clock, so every phase, input edge and raster bracket sits at an exact simulated time; rasters are bracketed every 50 ms of circuit time and cost none.',
      replayDifference: 'The original retained replay includes a no-credit Start at200ms. This ordinary Coin-then-Start probe omits it; existing UI startup guard prevents emitting that early edge. It is a candidate source-calibrated trajectory, not an identical full replay.',
      loaded, reset, coinHeld, coinReleased, reference, events, observations, failure };
  });
}
