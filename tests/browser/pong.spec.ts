// SPDX-License-Identifier: GPL-3.0-or-later
// Black-box browser checks. Emulated mobile browsers are not physical phones.
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
const root = fileURLToPath(new URL('../../', import.meta.url));

async function missingWasmServer(): Promise<{ url: string; restore: () => void; log: () => string; close: () => Promise<void> }> {
  const fixture = mkdtempSync(join(root, 'build/missing-wasm.'));
  const runtime = join(root, process.env.NOCPU_TEST_PACKAGED === '1' ? 'build/pages' : 'build/web');
  cpSync(runtime, fixture, { recursive: true });
  rmSync(join(fixture, 'core/nocpu.wasm'));
  const server = spawn('python3', ['tools/serve-pages.py', '--directory', fixture, '--base', '/NoCPU/', '--port', '0'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stderr.on('data', (chunk: Buffer) => { log += chunk.toString(); });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Missing-Wasm HTTP fixture did not start: ${log}`)), 10000);
      let output = '';
      server.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/NoCPU\//);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
      server.once('error', (error) => { clearTimeout(timeout); reject(error); });
      server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Missing-Wasm HTTP fixture exited ${code}: ${log}`)); });
    });
    return {
      url,
      restore: () => copyFileSync(join(runtime, 'core/nocpu.wasm'), join(fixture, 'core/nocpu.wasm')),
      log: () => log,
      close: async () => {
        if (server.exitCode === null) {
          await new Promise<void>((resolve) => { server.once('exit', () => resolve()); server.kill('SIGTERM'); });
        }
        rmSync(fixture, { recursive: true, force: true });
      },
    };
  } catch (error) {
    server.kill('SIGTERM');
    rmSync(fixture, { recursive: true, force: true });
    throw error;
  }
}

type Snapshot = {
  timeps: string; frame: number; hits: number; scores: [number, number];
  run: boolean; attract: boolean; axes: [number, number]; coin: boolean;
  heldKeys: string[]; pointerCount: number; paused: boolean;
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const debug = (window as any).__nocpuDebug;
    if (!debug?.snapshot) throw new Error('Read-only circuit observation is unavailable');
    const state = await debug.snapshot();
    return {
      timeps: state.timePs, frame: state.frame, hits: state.hits, scores: state.scores,
      run: state.runN === 0, attract: state.attractN === 0,
      axes: [state.inputs.paddle1, state.inputs.paddle2], coin: state.inputs.coin !== 0,
      heldKeys: state.heldKeys, pointerCount: state.pointerCount, paused: state.paused,
    };
  });
}

async function waitSimulation(page: Page, target: bigint): Promise<void> {
  await expect.poll(async () => BigInt((await snapshot(page)).timeps) >= target,
    { timeout: 30_000 }).toBe(true);
}

async function paddles(page: Page): Promise<[number, number]> {
  return page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const { width, height } = canvas;
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const visited = new Uint8Array(width * height);
    const components: { x: number; y: number; w: number; h: number; area: number }[] = [];
    for (let initial = 0; initial < width * height; initial += 1) {
      if (visited[initial] || rgba[initial * 4] < 150) continue;
      const stack = [initial]; visited[initial] = 1;
      let count = 0, sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
      while (stack.length) {
        const pixel = stack.pop()!;
        const x = pixel % width, y = Math.floor(pixel / width);
        count += 1; sx += x; sy += y;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const neighbors = [x ? pixel - 1 : -1, x + 1 < width ? pixel + 1 : -1,
          y ? pixel - width : -1, y + 1 < height ? pixel + width : -1];
        for (const next of neighbors) {
          if (next >= 0 && !visited[next] && rgba[next * 4] >= 150) {
            visited[next] = 1; stack.push(next);
          }
        }
      }
      components.push({ x: sx / count / width, y: sy / count / height,
        w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height, area: count });
    }
    const choose = (left: boolean): number => {
      const candidates = components.filter((part) => part.x > (left ? 0.07 : 0.70)
        && part.x < (left ? 0.25 : 0.92) && part.w < 0.03 && part.h > 0.035 && part.h < 0.25);
      candidates.sort((a, b) => b.area - a.area);
      if (!candidates.length) throw new Error(`No rendered ${left ? 'left' : 'right'} paddle`);
      return candidates[0].y;
    };
    return [choose(true), choose(false)];
  });
}

async function initialRenderedPaddles(page: Page): Promise<[number, number]> {
  let rendered: [number, number] | undefined;
  // Circuit telemetry can precede presentation of the first gameplay frame.
  // Require both actual rendered components before capturing the pixel baseline.
  await expect.poll(async () => {
    try {
      rendered = await paddles(page);
      return true;
    } catch (error) {
      if (!(error instanceof Error) || !/No rendered (left|right) paddle/.test(error.message)) throw error;
      return false;
    }
  }, { timeout: 10_000, message: 'Both original circuit paddles must appear in the rendered gameplay frame' }).toBe(true);
  return rendered!;
}

async function settledReleasedPaddles(page: Page, slot: number): Promise<[number, number]> {
  const released = await snapshot(page);
  await waitSimulation(page, BigInt(released.timeps) + 50_000_000_000n);
  expect((await snapshot(page)).axes[slot], 'Released keyboard input must stop native axis movement').toBe(released.axes[slot]);
  // The worker clock runs independently of presentation. Allow a frame request
  // and its next presentation after the original input polling has settled.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect((await snapshot(page)).axes[slot]).toBe(released.axes[slot]);
  return paddles(page);
}

async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as any;
    const NativeAudioContext = target.AudioContext || target.webkitAudioContext;
    target.__audioProbe = { contexts: [], gains: [], started: 0, stopped: 0, samples: 0, nonzero: 0, transitions: 0 };
    if (!NativeAudioContext) return;
    // Patch native prototypes: Firefox's WebIDL constructors can return a
    // native instance whose methods bypass a derived JavaScript prototype.
    const createGain = NativeAudioContext.prototype.createGain;
    NativeAudioContext.prototype.createGain = function (): GainNode {
      const gain = createGain.call(this); target.__audioProbe.gains.push(gain); return gain;
    };
    const createBufferSource = NativeAudioContext.prototype.createBufferSource;
    NativeAudioContext.prototype.createBufferSource = function (): AudioBufferSourceNode {
      const source = createBufferSource.call(this);
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        const data = source.buffer?.getChannelData(0);
        target.__audioProbe.started += 1;
        if (data) {
          target.__audioProbe.samples += data.length;
          for (let i = 0; i < data.length; i += 1) {
            if (data[i] !== 0) target.__audioProbe.nonzero += 1;
            if (i && data[i] !== data[i - 1]) target.__audioProbe.transitions += 1;
          }
        }
        return start(...args);
      };
      source.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => {
        target.__audioProbe.stopped += 1; return stop(...args);
      };
      return source;
    };
    class ObservedAudioContext extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options); target.__audioProbe.contexts.push(this);
      }
    }
    target.AudioContext = ObservedAudioContext;
    if (target.webkitAudioContext) target.webkitAudioContext = ObservedAudioContext;
  });
}

async function start(page: Page): Promise<void> {
  await page.goto('./?debug');
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await waitSimulation(page, 800_000_000_000n);
}

// Follow the game-shell UI rather than clicking controls hidden in submenus.
async function pauseMenu(page: Page): Promise<void> {
  if (!(await snapshot(page)).paused) await page.getByTestId('pause').click();
  if (await page.getByTestId('back').isVisible()) await page.getByTestId('back').click();
  await expect(page.getByTestId('resume')).toBeVisible();
}

async function resumePlay(page: Page): Promise<void> {
  if (await page.getByTestId('back').isVisible()) await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
}

async function togglePause(page: Page): Promise<void> {
  if ((await snapshot(page)).paused) await resumePlay(page);
  else await page.getByTestId('pause').click();
}

async function openSettings(page: Page): Promise<void> {
  await pauseMenu(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#volume')).toBeVisible();
}

async function openAbout(page: Page): Promise<void> {
  if (!(await page.getByRole('button', { name: 'About', exact: true }).isVisible())) await pauseMenu(page);
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByTestId('version')).toBeVisible();
}

async function expectViewportShell(page: Page): Promise<void> {
  const documentBounds = await page.evaluate(() => {
    window.scrollTo({ top: 9999, left: 9999, behavior: 'instant' });
    return {
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollX, scrollY,
    };
  });
  expect(documentBounds.scrollWidth).toBeLessThanOrEqual(documentBounds.width + 1);
  expect(documentBounds.scrollHeight).toBeLessThanOrEqual(documentBounds.height + 1);
  expect(documentBounds.scrollX, 'The game shell must not scroll horizontally').toBe(0);
  expect(documentBounds.scrollY, 'The game shell must not scroll vertically').toBe(0);
}

async function expectUsableTarget(page: Page, testId: string, namedButton = false): Promise<void> {
  const target = namedButton ? page.getByRole('button', { name: testId, exact: true }) : page.getByTestId(testId);
  const bounds = await target.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds, testId).not.toBeNull();
  // Firefox can report a CSS 44px edge as 43.9999847px. This arithmetic
  // tolerance is a thousandth of a pixel, not a smaller touch-target policy.
  expect(bounds!.width + 0.001, testId).toBeGreaterThanOrEqual(44);
  expect(bounds!.height + 0.001, testId).toBeGreaterThanOrEqual(44);
  expect(bounds!.x, testId).toBeGreaterThanOrEqual(-1);
  expect(bounds!.y, testId).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width, testId).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height, testId).toBeLessThanOrEqual(viewport.height + 1);
}

async function captureShellPanel(page: Page, testInfo: TestInfo, state: string): Promise<void> {
  const original = page.viewportSize()!;
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath(`shell-${state}.png`) });
  await page.setViewportSize({ width: 844, height: 390 });
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath(`shell-${state}-landscape.png`) });
  await page.setViewportSize(original);
}

test('loads genuine Wasm at the Pages base path and starts the original circuit', async ({ page }) => {
  await installAudioProbe(page);
  const wasmResponses: Promise<void>[] = [];
  page.on('response', (response) => {
    if (!new URL(response.url()).pathname.endsWith('.wasm')) return;
    wasmResponses.push((async () => {
      expect(response.ok()).toBe(true);
      expect(new URL(response.url()).pathname.startsWith('/NoCPU/')).toBe(true);
      expect((await response.body()).subarray(0, 4).toString('hex')).toBe('0061736d');
    })());
  });
  await start(page);
  expect(wasmResponses.length).toBeGreaterThan(0);
  await Promise.all(wasmResponses);
  const attract = await snapshot(page);
  expect(attract.attract).toBe(true);
  expect(attract.run).toBe(false);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run, { timeout: 15_000 }).toBe(true);
  expect((await snapshot(page)).attract).toBe(false);
  await expect.poll(async () => (await snapshot(page)).coin).toBe(false);
  const before = await initialRenderedPaddles(page);
  await page.keyboard.down('w');
  await expect.poll(async () => before[0] - (await paddles(page))[0], { timeout: 15_000 }).toBeGreaterThan(0.1);
  await page.keyboard.up('w');
  const leftMoved = await settledReleasedPaddles(page, 0);
  expect(Math.abs(leftMoved[1] - before[1])).toBeLessThan(0.025);
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await paddles(page))[1] - leftMoved[1], { timeout: 15_000 }).toBeGreaterThan(0.1);
  await page.keyboard.up('ArrowDown');
  expect(Math.abs((await settledReleasedPaddles(page, 1))[0] - leftMoved[0])).toBeLessThan(0.025);
  await expect.poll(async () => page.evaluate(async () => (await (window as any).__nocpuDebug.snapshot()).audio.scheduledSamples)).toBeGreaterThan(4800);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(4800);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.nonzero)).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.transitions)).toBeGreaterThan(0);
  await openAbout(page);
  await expect(page.getByTestId('version')).toContainText(version);
});

test('pause, reset, mute and focus loss recover without stale inputs or catch-up', async ({ page }) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-label', 'Mute sound');
  await openSettings(page);
  await expect(page.getByTestId('mute')).toHaveAccessibleName('Mute sound');
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
  // Settings pauses the circuit and clears every source. Observe native gain
  // after explicit Resume, when the audio graph processes its scheduled change.
  await resumePlay(page);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBe(0);
  await openSettings(page);
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'false');
  await resumePlay(page);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBeCloseTo(0.6);
  await openSettings(page);
  await page.locator('#volume').focus();
  await page.keyboard.press('Home');
  await resumePlay(page);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBe(0);
  await openSettings(page);
  await page.locator('#volume').focus();
  await page.keyboard.press('End');
  await resumePlay(page);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBe(1);
  await togglePause(page);
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  // Wait for a bounded already-running worker slice, then assert no advancement.
  await page.waitForTimeout(150);
  const paused = await snapshot(page);
  const audioStarted = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.waitForTimeout(350);
  expect((await snapshot(page)).timeps).toBe(paused.timeps);
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(audioStarted);
  await togglePause(page);
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => BigInt((await snapshot(page)).timeps) > BigInt(paused.timeps)).toBe(true);
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).heldKeys).toContain('KeyS');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  expect((await snapshot(page)).heldKeys).toEqual([]);
  expect((await snapshot(page)).pointerCount).toBe(0);
  await page.keyboard.up('s');
  const lostFocusAxis = (await snapshot(page)).axes[0];
  await togglePause(page);
  const resumed = await snapshot(page);
  await waitSimulation(page, BigInt(resumed.timeps) + 300_000_000_000n);
  expect((await snapshot(page)).axes[0]).toBe(lostFocusAxis);
  await pauseMenu(page);
  await page.getByTestId('reset').click();
  await resumePlay(page);
  await expect.poll(async () => (await snapshot(page)).attract).toBe(true);
  const reset = await snapshot(page);
  expect(reset.scores).toEqual([0, 0]);
  expect(reset.coin).toBe(false);
  expect(reset.axes).toEqual([0, 0]);
  expect(BigInt(reset.timeps)).toBeLessThan(BigInt(resumed.timeps));
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run, { timeout: 15_000 }).toBe(true);
});

test('reset completion survives same-turn blur and resume without freezing controls', async ({ page }) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(4800);
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).heldKeys).toContain('KeyS');
  await page.evaluate(() => {
    (document.querySelector('[data-testid="reset"]') as HTMLButtonElement).click();
    window.dispatchEvent(new Event('blur'));
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(150);
  const resetPaused = await snapshot(page);
  expect(resetPaused.paused).toBe(true);
  expect(resetPaused.scores).toEqual([0, 0]);
  expect(resetPaused.axes).toEqual([0, 0]);
  expect(resetPaused.coin).toBe(false);
  expect(resetPaused.heldKeys).toEqual([]);
  expect(BigInt(resetPaused.timeps)).toBeLessThan(80_000_000_000n);
  // A fresh native circuit's attract pin has not settled at time zero. Preserve
  // the pause, then check settled attract only after an explicit user resume.
  const played = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).timeps).toBe(resetPaused.timeps);
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(played);
  await page.keyboard.up('s');
  await togglePause(page);
  await expect(page.getByTestId('paddle-p1')).toHaveAttribute('aria-disabled', 'false');
  await waitSimulation(page, 300_000_000_000n);
  expect((await snapshot(page)).attract).toBe(true);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.started)).toBeGreaterThan(played);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);

  // Conversely, resuming an already-paused reset changes the clock generation
  // before its acknowledgement returns. Completion must still enable controls.
  await togglePause(page);
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    (document.querySelector('[data-testid="reset"]') as HTMLButtonElement).click();
    (document.querySelector('[data-testid="resume"]') as HTMLButtonElement).click();
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('paddle-p2')).toHaveAttribute('aria-disabled', 'false');
  await waitSimulation(page, 500_000_000_000n);
  const resetResumed = await snapshot(page);
  expect(resetResumed.scores).toEqual([0, 0]);
  expect(resetResumed.axes).toEqual([0, 0]);
  expect(resetResumed.coin).toBe(false);
  expect(resetResumed.attract).toBe(true);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
});

test('simultaneous touch paddles move independently and cancellation releases held gestures', async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'CDP supplies true simultaneous browser touch contacts; physical iPhone testing remains required.');
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await waitSimulation(page, 1_100_000_000_000n);
  const p1 = await page.getByTestId('paddle-p1').boundingBox();
  const p2 = await page.getByTestId('paddle-p2').boundingBox();
  expect(p1).not.toBeNull(); expect(p2).not.toBeNull();
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const centered = await initialRenderedPaddles(page);
  const points = [
    { id: 11, x: p1!.x + p1!.width / 2, y: p1!.y + p1!.height * 0.2 },
    { id: 22, x: p2!.x + p2!.width / 2, y: p2!.y + p2!.height * 0.8 },
  ];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await expect.poll(async () => (await snapshot(page)).pointerCount).toBe(2);
  await expect.poll(async () => (await snapshot(page)).axes[0]).toBeLessThan(-8000);
  await expect.poll(async () => (await snapshot(page)).axes[1]).toBeGreaterThan(8000);
  await expect.poll(async () => centered[0] - (await paddles(page))[0]).toBeGreaterThan(0.1);
  await expect.poll(async () => (await paddles(page))[1] - centered[1]).toBeGreaterThan(0.1);
  await page.screenshot({ path: testInfo.outputPath('shell-touch-active.png') });
  const bothMoved = await paddles(page);
  const before = await snapshot(page);
  points[0].y = p1!.y + p1!.height * 0.75;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
  await expect.poll(async () => (await snapshot(page)).axes[0]).toBeGreaterThan(6000);
  await expect.poll(async () => (await paddles(page))[0] - bothMoved[0]).toBeGreaterThan(0.2);
  expect(Math.abs((await paddles(page))[1] - bothMoved[1])).toBeLessThan(0.025);
  expect((await snapshot(page)).axes[1]).toBe(before.axes[1]);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await snapshot(page)).pointerCount).toBe(0);
  const cancelled = await snapshot(page);
  await waitSimulation(page, BigInt(cancelled.timeps) + 300_000_000_000n);
  expect((await snapshot(page)).axes).toEqual(cancelled.axes);

  // A game-menu transition must also release two actual held contacts, not
  // merely clear the controls after an already completed touchCancel.
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await expect.poll(async () => (await snapshot(page)).pointerCount).toBe(2);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('resume')).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).pointerCount).toBe(0);
  await page.waitForTimeout(150);
  const menuPaused = await snapshot(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(200);
  expect((await snapshot(page)).timeps).toBe(menuPaused.timeps);
  await resumePlay(page);
  await waitSimulation(page, BigInt(menuPaused.timeps) + 300_000_000_000n);
  expect((await snapshot(page)).axes).toEqual(menuPaused.axes);
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await Promise.all([page.getByTestId('paddle-p1').boundingBox(), page.getByTestId('paddle-p2').boundingBox()]);
  const landscapePoints = landscape.map((bounds, slot) => ({
    id: 31 + slot, x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height * (slot ? 0.8 : 0.2),
  }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: landscapePoints });
  await expect.poll(async () => (await snapshot(page)).pointerCount).toBe(2);
  await page.screenshot({ path: testInfo.outputPath('shell-touch-active-landscape.png') });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await snapshot(page)).pointerCount).toBe(0);
  await session.detach();
});

test('a missing Wasm asset produces an actionable error instead of simulated gameplay', async ({ page }, testInfo) => {
  // Fail real worker HTTP requests on every engine, including Firefox, where
  // Playwright route interception does not cover the worker's Wasm download.
  const fixture = await missingWasmServer();
  try {
    await page.goto(`${fixture.url}?debug`);
    await page.getByTestId('play-pong').click();
    await expect(page.getByTestId('error')).toBeVisible({ timeout: 30_000 });
    expect(fixture.log()).toMatch(/GET \/NoCPU\/core\/nocpu\.wasm HTTP\/1\.1" 404/);
    await expect(page.getByTestId('error')).toContainText(/load|download|Wasm|WebAssembly|retry/i);
    await expect(page.getByTestId('insert-coin')).toBeDisabled();
    await expect(page.getByTestId('pause')).toBeDisabled();
    await expect(page.getByTestId('reset')).toBeDisabled();
    await captureShellPanel(page, testInfo, 'error');
    fixture.restore();
    await page.locator('#retry').click();
    await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
    await waitSimulation(page, 800_000_000_000n);
    await expect(page.getByTestId('error')).toBeHidden();
    await expect(page.getByTestId('insert-coin')).toBeEnabled();
  } finally {
    await fixture.close();
  }
});

test('audio interruption and visibility loss pause safely and recover from a new gesture', async ({ page }) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await page.evaluate(async () => { await (window as any).__audioProbe.contexts[0].suspend(); });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(150);
  const suspended = await snapshot(page);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).timeps).toBe(suspended.timeps);
  await togglePause(page);
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.contexts[0].state)).toBe('running');
  // Browser automation cannot physically lock a phone. Exercise the actual
  // visibility handler with a synthetic hidden state, independently of blur.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await togglePause(page);
  expect((await snapshot(page)).paused).toBe(true);
  await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await togglePause(page);
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  const resumed = await snapshot(page);
  await waitSimulation(page, BigInt(resumed.timeps) + 300_000_000_000n);
});

test('an unresolved audio resume cannot freeze play and sound retry recovers safely', async ({ page }) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(4800);
  await page.evaluate(async () => {
    const target = window as any;
    const context = target.__audioProbe.contexts[0] as AudioContext;
    await context.suspend();
    target.__originalResume = context.resume.bind(context);
    const pending = new Promise<void>((resolve) => { target.__releaseResume = resolve; });
    context.resume = () => pending;
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  const stopped = await snapshot(page);
  await togglePause(page);
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await waitSimulation(page, BigInt(stopped.timeps) + 300_000_000_000n);
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-label', 'Enable sound', { timeout: 5000 });
  await page.evaluate(() => {
    const target = window as any;
    target.__audioProbe.contexts[0].resume = target.__originalResume;
  });
  const beforeRetry = await page.evaluate(() => (window as any).__audioProbe.samples);
  await openSettings(page);
  await expect(page.getByTestId('mute')).toHaveAccessibleName('Enable sound');
  await page.getByTestId('mute').click();
  await resumePlay(page);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.contexts[0].state)).toBe('running');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(beforeRetry);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(150);
  const beforeLateResume = await snapshot(page);
  const played = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.evaluate(() => (window as any).__releaseResume());
  await page.waitForTimeout(200);
  expect((await snapshot(page)).timeps).toBe(beforeLateResume.timeps);
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(played);
});

test('a delayed valid audio activation recovers sound while play continues', async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(4800);
  await page.evaluate(async () => {
    const target = window as any;
    await (target.__audioProbe.contexts[0] as AudioContext).close();
    // Prepare a fresh real device outside the gesture so its native state is
    // suspended. This isolates valid asynchronous recovery from WebKit's
    // separately measured synchronous stalls on a reused native device.
    const ObservedAudioContext = target.AudioContext;
    const context = new ObservedAudioContext({ latencyHint: 'interactive' }) as AudioContext;
    await context.suspend();
    if (context.state !== 'suspended') throw new Error('Prepared native audio device must be suspended');
    target.__preparedContextConsumed = false;
    target.AudioContext = function PreparedAudioContext(): AudioContext {
      target.AudioContext = ObservedAudioContext;
      target.__preparedContextConsumed = true;
      return context;
    };
    target.AudioContext.prototype = ObservedAudioContext.prototype;
    const originalResume = context.resume.bind(context);
    target.__delayedResumeCompleted = false;
    target.__delayedPendingObservation = null;
    context.resume = () => {
      const began = performance.now();
      // Register the delay before calling native code: WebKit's backend may
      // block synchronously inside resume(), before returning its promise.
      const delay = new Promise<void>((resolve) => setTimeout(() => {
        target.__delayedResumeTimerElapsed = performance.now() - began;
        resolve();
      }, 2200));
      const native = originalResume();
      target.__delayedResumeInvocationElapsed = performance.now() - began;
      // Observe the real circuit and source scheduling in the browser while
      // activation is pending. External click/poll RPCs may return afterwards.
      const observePending = async (): Promise<void> => {
        try {
          const state = await target.__nocpuDebug.snapshot();
          const observed = {
            timePs: state.timePs, paused: state.paused,
            completed: target.__delayedResumeCompleted,
            started: target.__audioProbe.started,
            elapsedMilliseconds: performance.now() - began,
          };
          if (!observed.completed && BigInt(state.timePs) >= BigInt(target.__delayedSimulationTarget)) {
            target.__delayedPendingObservation = observed;
          } else if (!target.__delayedResumeCompleted) {
            setTimeout(() => { void observePending(); }, 10);
          }
        } catch (error) { target.__delayedObservationError = String(error); }
      };
      void observePending();
      return Promise.all([
        native, delay,
      ]).then(() => {
        target.__delayedResumeElapsed = performance.now() - began;
        target.__delayedResumeCompleted = true;
      });
    };
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  const paused = await snapshot(page);
  const started = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.evaluate((targetTime) => { (window as any).__delayedSimulationTarget = targetTime; },
    (BigInt(paused.timeps) + 300_000_000_000n).toString());
  await togglePause(page);
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => page.evaluate(() => (window as any).__delayedResumeCompleted), { timeout: 5000 }).toBe(true);
  const timing = await page.evaluate(() => ({
    totalResumeMilliseconds: (window as any).__delayedResumeElapsed,
    nativeInvocationMilliseconds: (window as any).__delayedResumeInvocationElapsed,
    concurrentTimerMilliseconds: (window as any).__delayedResumeTimerElapsed,
    preparedContextConsumed: (window as any).__preparedContextConsumed,
    nativeContextState: (window as any).__audioProbe.contexts.at(-1).state,
    pendingObservation: (window as any).__delayedPendingObservation,
    observationError: (window as any).__delayedObservationError,
  }));
  const elapsed = timing.totalResumeMilliseconds;
  await testInfo.attach('delayed-audio-activation.json', {
    body: Buffer.from(JSON.stringify({ ...timing, requestedConcurrentDelayMilliseconds: 2200 })), contentType: 'application/json',
  });
  expect(timing.preparedContextConsumed).toBe(true);
  expect(timing.nativeContextState).toBe('running');
  expect(timing.observationError).toBeUndefined();
  expect(timing.pendingObservation, 'Observe circuit advancement and silence during the actual pending window').not.toBeNull();
  expect(BigInt(timing.pendingObservation.timePs)).toBeGreaterThanOrEqual(BigInt(paused.timeps) + 300_000_000_000n);
  expect(timing.pendingObservation.paused).toBe(false);
  expect(timing.pendingObservation.completed).toBe(false);
  expect(timing.pendingObservation.started).toBe(started);
  expect(elapsed, 'Exercise a valid activation beyond the former 1500 ms cutoff').toBeGreaterThan(2000);
  expect(elapsed, 'Native activation and the concurrent delay must complete within the finite recovery window').toBeLessThan(3000);
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-label', 'Mute sound');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.started)).toBeGreaterThan(started);
});

test('backgrounding cancels a pending audio gesture before it completes', async ({ page }) => {
  await installAudioProbe(page);
  await start(page);
  await page.evaluate(async () => {
    const target = window as any;
    const context = target.__audioProbe.contexts[0] as AudioContext;
    await context.suspend();
    const originalResume = context.resume.bind(context);
    context.resume = () => {
      target.__earlyResumeStarted = performance.now();
      return new Promise<void>((resolve) => {
        target.__finishEarlyResume = async () => { await originalResume(); resolve(); };
      });
    };
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await togglePause(page);
  await expect.poll(async () => page.evaluate(() => typeof (window as any).__finishEarlyResume)).toBe('function');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(150);
  const paused = await snapshot(page);
  const started = await page.evaluate(() => (window as any).__audioProbe.started);
  const elapsed = await page.evaluate(async () => {
    const target = window as any;
    await target.__finishEarlyResume();
    return performance.now() - target.__earlyResumeStarted;
  });
  expect(elapsed, 'Complete the pending gesture before its 3000 ms expiry').toBeLessThan(2800);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.contexts[0].state)).toBe('running');
  await page.waitForTimeout(200);
  expect((await snapshot(page)).timeps).toBe(paused.timeps);
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(started);
  await togglePause(page);
  await waitSimulation(page, BigInt(paused.timeps) + 300_000_000_000n);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.started)).toBeGreaterThan(started);
});

test('a sustained browser session generates circuit scoring and bounded media', async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await page.getByTestId('paddle-p1').focus();
  await page.keyboard.press('Home');
  await page.getByTestId('paddle-p2').focus();
  await page.keyboard.press('Home');
  const initial = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  await page.waitForTimeout(8000);
  const final = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  const simulationSeconds = Number(BigInt(final.state.timePs) - BigInt(initial.state.timePs)) / 1e12;
  const wallSeconds = (final.wall - initial.wall) / 1000;
  const metrics = { simulationSeconds, wallSeconds, simulationSpeedRatio: simulationSeconds / wallSeconds,
    initialWasmMemoryCapacityBytes: initial.state.worker.wasmMemoryCapacityBytes,
    finalWasmMemoryCapacityBytes: final.state.worker.wasmMemoryCapacityBytes,
    audio: final.state.audio, worker: final.state.worker,
    evidenceScope: 'Eight-second headless browser sample; emulated phones are not physical-device performance.' };
  await testInfo.attach('browser-performance.json', { body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: 'application/json' });
  expect(metrics.simulationSpeedRatio).toBeGreaterThanOrEqual(0.85);
  expect(metrics.finalWasmMemoryCapacityBytes).toBeLessThanOrEqual(metrics.initialWasmMemoryCapacityBytes * 1.25);
  expect(final.state.audio.coreOverruns).toBe(0);
  expect(final.state.audio.queueDepth).toBeLessThan(30);
  expect(final.state.scores[0] + final.state.scores[1]).toBeGreaterThan(0);
  expect(final.state.frame - initial.state.frame).toBeGreaterThan(400);
  expect(final.state.audio.scheduledSamples - initial.state.audio.scheduledSamples).toBeGreaterThan(300000);
  expect(final.state.audio.transitions).toBeGreaterThan(0);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).scores).toEqual([0, 0]);
});

test('portrait, landscape and desktop layouts keep the court and controls in a full viewport game', async ({ page }, testInfo) => {
  await start(page);
  for (const size of [{ width: 390, height: 844 }, { width: 390, height: 664 }, { width: 320, height: 568 },
    { width: 844, height: 390 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await expect(page.getByTestId('game-canvas')).toBeVisible();
    await expectViewportShell(page);
    const canvas = await page.getByTestId('game-canvas').boundingBox();
    expect(canvas).not.toBeNull();
    expect(canvas!.width / canvas!.height).toBeCloseTo(4 / 3, 1);
    const usableCourtWidth = Math.min(size.width, (size.height - 64) * 4 / 3);
    expect(canvas!.width, 'Court uses the available viewport rather than a website card').toBeGreaterThanOrEqual(usableCourtWidth * 0.9);
    for (const id of ['game-canvas', 'paddle-p1', 'paddle-p2']) {
      const bounds = await page.getByTestId(id).boundingBox();
      expect(bounds!.y, `${id} must share the gameplay viewport`).toBeGreaterThanOrEqual(-1);
      expect(bounds!.y + bounds!.height, `${id} must share the gameplay viewport`).toBeLessThanOrEqual(size.height + 1);
    }
    for (const id of ['paddle-p1', 'paddle-p2', 'insert-coin', 'pause']) await expectUsableTarget(page, id);
    await page.screenshot({ path: testInfo.outputPath(`shell-play-${size.width}x${size.height}.png`) });
    await pauseMenu(page);
    for (const id of ['resume', 'reset']) await expectUsableTarget(page, id);
    for (const name of ['Settings', 'How to play', 'About']) await expectUsableTarget(page, name, true);
    await expectViewportShell(page);
    await page.screenshot({ path: testInfo.outputPath(`shell-pause-${size.width}x${size.height}.png`) });
    await resumePlay(page);
  }
});

test('title and game menus support keyboard navigation without leaking gameplay input', async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await page.goto('./?debug');
  await expect(page.getByTestId('play-pong')).toBeVisible();
  await captureShellPanel(page, testInfo, 'title');
  await page.getByTestId('play-pong').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await waitSimulation(page, 800_000_000_000n);
  expect((await snapshot(page)).attract).toBe(true);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).heldKeys).toContain('KeyS');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('resume')).toBeVisible();
  await page.keyboard.up('s');
  await page.waitForTimeout(150);
  const paused = await snapshot(page);
  expect(paused.heldKeys).toEqual([]);
  expect(paused.pointerCount).toBe(0);
  const started = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.keyboard.press('w');
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'How to play', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const menuState = await snapshot(page);
  expect(menuState.timeps).toBe(paused.timeps);
  expect(menuState.axes).toEqual(paused.axes);
  expect(menuState.heldKeys).toEqual([]);
  expect(menuState.coin).toBe(false);
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(started);
  await openSettings(page);
  await expect(page.locator('#volume')).toBeVisible();
  await expectUsableTarget(page, 'mute');
  await captureShellPanel(page, testInfo, 'settings');
  await page.getByTestId('back').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.getByTestId('back')).toBeVisible();
  await captureShellPanel(page, testInfo, 'help');
  await page.getByTestId('back').click();
  await openAbout(page);
  await expect(page.getByTestId('version')).toContainText(version);
  await captureShellPanel(page, testInfo, 'about');
  const aboutViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('link', { name: 'Credits & notices', exact: true }).scrollIntoViewIfNeeded();
  for (const name of ['Source', 'GPL v3', 'Credits & notices']) {
    const bounds = await page.getByRole('link', { name, exact: true }).boundingBox();
    expect(bounds, name).not.toBeNull();
    expect(bounds!.y, `${name} is reachable within About`).toBeGreaterThanOrEqual(-1);
    expect(bounds!.y + bounds!.height, `${name} is reachable within About`).toBeLessThanOrEqual(391);
  }
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath('shell-about-landscape-source-links.png') });
  await page.getByTestId('back').scrollIntoViewIfNeeded();
  await expectUsableTarget(page, 'back');
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath('shell-about-landscape-back.png') });
  await page.setViewportSize(aboutViewport);
  await page.getByTestId('back').click();
  expect((await snapshot(page)).paused).toBe(true);
  // The contextual dialog contains keyboard focus, including wrap-around.
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
  }
  await page.getByTestId('resume').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await waitSimulation(page, BigInt(paused.timeps) + 300_000_000_000n);
  expect((await snapshot(page)).axes).toEqual(paused.axes);
});

test('returning to the title stops playback and starting again creates a fresh circuit', async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(4800);
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).heldKeys).toContain('KeyS');
  await waitSimulation(page, 2_000_000_000_000n);
  const old = await snapshot(page);
  await pauseMenu(page);
  await page.getByTestId('return-title').click();
  await page.keyboard.up('s');
  await expect(page.getByTestId('play-pong')).toBeVisible();
  await expect(page.getByTestId('insert-coin')).toBeHidden();
  await expectViewportShell(page);
  const played = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(played);
  expect(await page.evaluate(async () => {
    try { await (window as any).__nocpuDebug.snapshot(); return false; }
    catch { return true; }
  }), 'Returning to title disposes the old circuit observation').toBe(true);
  await page.screenshot({ path: testInfo.outputPath('shell-returned-title.png') });
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await waitSimulation(page, 800_000_000_000n);
  const fresh = await snapshot(page);
  expect(fresh.attract).toBe(true);
  expect(fresh.run).toBe(false);
  expect(fresh.scores).toEqual([0, 0]);
  expect(fresh.axes).toEqual([0, 0]);
  expect(fresh.coin).toBe(false);
  expect(fresh.heldKeys).toEqual([]);
  expect(fresh.pointerCount).toBe(0);
  expect(BigInt(fresh.timeps)).toBeLessThan(BigInt(old.timeps));
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.started)).toBeGreaterThan(played);
});

test('distributed assets, source and notices match the build manifest', async ({ request, page }) => {
  test.skip(process.env.NOCPU_TEST_PACKAGED !== '1', 'Matching source, notices and build manifest are added by the Pages packager.');
  const response = await request.get('BUILD-MANIFEST.json');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.schema_version).toBe(1);
  expect(manifest.project).toBe('NoCPU');
  expect(manifest.version).toBe(version);
  expect(manifest.buildId).toEqual(expect.any(String));
  expect(manifest.files.length).toBeGreaterThan(5);
  const paths = new Set<string>();
  for (const file of manifest.files) {
    expect(file.path).not.toMatch(/(^\/|\.\.|\\|(^|\/)roms?(\/|$)|\.zip$|\.bin$)/i);
    expect(paths.has(file.path)).toBe(false); paths.add(file.path);
    const asset = await request.get(file.path);
    expect(asset.ok(), file.path).toBe(true);
    const contents = await asset.body();
    expect(contents.length, file.path).toBe(file.size);
    expect(createHash('sha256').update(contents).digest('hex'), file.path).toBe(file.sha256);
  }
  expect(paths.has(manifest.source_archive.path)).toBe(true);
  expect(paths.has('notices/LICENSE')).toBe(true);
  expect(paths.has('notices/THIRD_PARTY_NOTICES.md')).toBe(true);
  expect([...paths].some((path) => path.endsWith('.wasm'))).toBe(true);
  await page.goto('./');
  await openAbout(page);
  await expect(page.getByTestId('version')).toContainText(manifest.version);
  await expect(page.getByTestId('version')).toContainText(manifest.buildId);
  const base = new URL(page.url()).pathname;
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', `${base}${manifest.source_archive.path}`);
  await expect(page.getByRole('link', { name: 'GPL v3', exact: true })).toHaveAttribute('href', `${base}notices/LICENSE`);
  await expect(page.getByRole('link', { name: 'Credits & notices', exact: true })).toHaveAttribute('href', `${base}notices/THIRD_PARTY_NOTICES.md`);
  await expect(page.getByRole('link', { name: 'DICE', exact: true })).toBeVisible();
});
