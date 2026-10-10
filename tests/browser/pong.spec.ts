// SPDX-License-Identifier: GPL-3.0-or-later
// Black-box browser checks. Emulated mobile browsers are not physical phones.
import { test, expect, type Page } from '@playwright/test';
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
  const before = await paddles(page);
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
  await expect(page.getByTestId('version')).toContainText(version);
});

test('pause, reset, mute and focus loss recover without stale inputs or catch-up', async ({ page }) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await expect(page.getByTestId('mute')).toHaveAccessibleName('Mute sound');
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBe(0);
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBeCloseTo(0.6);
  await page.locator('#volume').focus();
  await page.keyboard.press('Home');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.gains[0].gain.value)).toBe(1);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  // Wait for a bounded already-running worker slice, then assert no advancement.
  await page.waitForTimeout(150);
  const paused = await snapshot(page);
  const audioStarted = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.waitForTimeout(350);
  expect((await snapshot(page)).timeps).toBe(paused.timeps);
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(audioStarted);
  await page.getByTestId('pause').click();
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
  await page.getByTestId('pause').click();
  const resumed = await snapshot(page);
  await waitSimulation(page, BigInt(resumed.timeps) + 300_000_000_000n);
  expect((await snapshot(page)).axes[0]).toBe(lostFocusAxis);
  await page.getByTestId('reset').click();
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
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('paddle-p1')).toHaveAttribute('aria-disabled', 'false');
  await waitSimulation(page, 300_000_000_000n);
  expect((await snapshot(page)).attract).toBe(true);
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.started)).toBeGreaterThan(played);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);

  // Conversely, resuming an already-paused reset changes the clock generation
  // before its acknowledgement returns. Completion must still enable controls.
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    (document.querySelector('[data-testid="reset"]') as HTMLButtonElement).click();
    (document.querySelector('[data-testid="pause"]') as HTMLButtonElement).click();
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

test('simultaneous touch paddles move independently and cancellation releases held gestures', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP supplies true simultaneous browser touch contacts; physical iPhone testing remains required.');
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await waitSimulation(page, 1_100_000_000_000n);
  await page.getByTestId('paddle-p1').scrollIntoViewIfNeeded();
  const p1 = await page.getByTestId('paddle-p1').boundingBox();
  const p2 = await page.getByTestId('paddle-p2').boundingBox();
  expect(p1).not.toBeNull(); expect(p2).not.toBeNull();
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const centered = await paddles(page);
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
  await session.detach();
});

test('a missing Wasm asset produces an actionable error instead of simulated gameplay', async ({ page }) => {
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
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => page.evaluate(() => (window as any).__audioProbe.contexts[0].state)).toBe('running');
  // Browser automation cannot physically lock a phone. Exercise the actual
  // visibility handler with a synthetic hidden state, independently of blur.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pause').click();
  expect((await snapshot(page)).paused).toBe(true);
  await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByTestId('pause').click();
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
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await waitSimulation(page, BigInt(stopped.timeps) + 300_000_000_000n);
  await expect(page.getByTestId('mute')).toHaveAccessibleName('Enable sound', { timeout: 5000 });
  await page.evaluate(() => {
    const target = window as any;
    target.__audioProbe.contexts[0].resume = target.__originalResume;
  });
  const beforeRetry = await page.evaluate(() => (window as any).__audioProbe.samples);
  await page.getByTestId('mute').click();
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
    const context = target.__audioProbe.contexts[0] as AudioContext;
    await context.suspend();
    const originalResume = context.resume.bind(context);
    target.__delayedResumeCompleted = false;
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
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  await waitSimulation(page, BigInt(paused.timeps) + 300_000_000_000n);
  const pending = await page.evaluate(() => ({
    completed: (window as any).__delayedResumeCompleted,
    started: (window as any).__audioProbe.started,
  }));
  expect(pending.completed).toBe(false);
  expect(pending.started).toBe(started);
  await expect.poll(async () => page.evaluate(() => (window as any).__delayedResumeCompleted), { timeout: 5000 }).toBe(true);
  const timing = await page.evaluate(() => ({
    totalResumeMilliseconds: (window as any).__delayedResumeElapsed,
    nativeInvocationMilliseconds: (window as any).__delayedResumeInvocationElapsed,
    concurrentTimerMilliseconds: (window as any).__delayedResumeTimerElapsed,
  }));
  const elapsed = timing.totalResumeMilliseconds;
  await testInfo.attach('delayed-audio-activation.json', {
    body: Buffer.from(JSON.stringify({ ...timing, requestedConcurrentDelayMilliseconds: 2200 })), contentType: 'application/json',
  });
  expect(elapsed, 'Exercise a valid activation beyond the former 1500 ms cutoff').toBeGreaterThan(2000);
  expect(elapsed, 'Native activation and the concurrent delay must complete within the finite recovery window').toBeLessThan(3000);
  await expect(page.getByTestId('mute')).toHaveAccessibleName('Mute sound');
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
  await page.getByTestId('pause').click();
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
  await page.getByTestId('pause').click();
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

test('portrait and landscape layouts keep the canvas and two touch controls usable', async ({ page }, testInfo) => {
  await start(page);
  for (const size of [{ width: 390, height: 844 }, { width: 390, height: 664 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await expect(page.getByTestId('game-canvas')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    const canvas = await page.getByTestId('game-canvas').boundingBox();
    expect(canvas).not.toBeNull();
    expect(canvas!.width / canvas!.height).toBeCloseTo(4 / 3, 1);
    await page.getByTestId('game-canvas').scrollIntoViewIfNeeded();
    for (const id of ['game-canvas', 'paddle-p1', 'paddle-p2']) {
      const bounds = await page.getByTestId(id).boundingBox();
      expect(bounds!.y, `${id} must share the gameplay viewport`).toBeGreaterThanOrEqual(-1);
      expect(bounds!.y + bounds!.height, `${id} must share the gameplay viewport`).toBeLessThanOrEqual(size.height + 1);
    }
    for (const id of ['paddle-p1', 'paddle-p2', 'insert-coin', 'pause', 'reset', 'mute']) {
      const bounds = await page.getByTestId(id).boundingBox();
      expect(bounds, id).not.toBeNull();
      expect(bounds!.width, id).toBeGreaterThanOrEqual(44);
      expect(bounds!.height, id).toBeGreaterThanOrEqual(44);
      expect(bounds!.x, id).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width, id).toBeLessThanOrEqual(size.width + 1);
    }
    await page.screenshot({ path: testInfo.outputPath(`layout-${size.width}x${size.height}.png`), fullPage: true });
  }
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
  await expect(page.getByTestId('version')).toContainText(manifest.version);
  await expect(page.getByTestId('version')).toContainText(manifest.buildId);
});
