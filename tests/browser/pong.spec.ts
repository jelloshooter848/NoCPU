// SPDX-License-Identifier: GPL-3.0-or-later
// Black-box desktop browser checks.
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packagedDirectory } from '../package-directory';

import { snapshot, waitSimulation, paddles, initialRenderedPaddles, settledReleasedPaddles, installAudioProbe, start, pauseMenu, resumePlay, togglePause, openSettings, openAbout, expectViewportShell, expectUsableTarget, settleInputPresentation, expectDesktopLayout, captureShellPanel } from './helpers';

const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
const root = fileURLToPath(new URL('../../', import.meta.url));

async function missingWasmServer(): Promise<{ url: string; wasmSha256: string; restore: () => void; log: () => string; close: () => Promise<void> }> {
  const fixture = mkdtempSync(join(root, 'build/missing-wasm.'));
  const runtime = process.env.NOCPU_TEST_PACKAGED === '1'
    ? packagedDirectory(root) : join(root, 'build/web');
  const wasmSha256 = createHash('sha256').update(readFileSync(join(runtime, 'core/nocpu.wasm'))).digest('hex');
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
      wasmSha256,
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

test('loads genuine Wasm at the Pages base path and starts the original circuit', { tag: '@game-pong' }, async ({ page }) => {
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

test('pause, reset, mute and focus loss recover without stale inputs or catch-up', { tag: '@game-pong' }, async ({ page }) => {
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

test('reset completion survives same-turn blur and resume without freezing controls', { tag: '@game-pong' }, async ({ page }) => {
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
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
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
  await waitSimulation(page, 500_000_000_000n);
  const resetResumed = await snapshot(page);
  expect(resetResumed.scores).toEqual([0, 0]);
  expect(resetResumed.axes).toEqual([0, 0]);
  expect(resetResumed.coin).toBe(false);
  expect(resetResumed.attract).toBe(true);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
});

test('the mouse over the display covers the full native paddle range for the chosen player', { tag: '@game-pong' }, async ({ page }, testInfo) => {
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await initialRenderedPaddles(page);
  const canvas = (await page.getByTestId('game-canvas').boundingBox())!;
  const x = canvas.x + canvas.width / 2;
  for (const slot of [0, 1]) {
    if (slot === 1) {
      await openSettings(page);
      await page.getByTestId('mouse-slot').selectOption('1');
      await resumePlay(page);
    }
    const other = (await snapshot(page)).axes[1 - slot];
    await page.mouse.move(x, canvas.y + canvas.height / 2);
    // Browser pointer coordinates can round by a fraction of a CSS pixel.
    await expect.poll(async () => Math.abs((await snapshot(page)).axes[slot])).toBeLessThanOrEqual(512);
    await page.mouse.move(x, canvas.y + canvas.height * 0.25);
    await expect.poll(async () => (await snapshot(page)).axes[slot]).toBeLessThan(-12000);
    await expect.poll(async () => (await paddles(page))[slot]).toBeLessThan(0.4);
    const upper = await paddles(page);
    await page.mouse.move(x, canvas.y + canvas.height * 0.75);
    await expect.poll(async () => (await snapshot(page)).axes[slot]).toBeGreaterThan(12000);
    await expect.poll(async () => (await paddles(page))[slot] - upper[slot]).toBeGreaterThan(0.3);
    // Both exact native endpoints are reachable without leaving the display.
    await page.mouse.move(x, canvas.y + 2);
    await expect.poll(async () => (await snapshot(page)).axes[slot]).toBe(-32768);
    await page.mouse.move(x, canvas.y + canvas.height - 2);
    await expect.poll(async () => (await snapshot(page)).axes[slot]).toBe(32767);
    await settleInputPresentation(page);
    await page.screenshot({ path: testInfo.outputPath(`mouse-p${slot + 1}-bottom.png`) });
    // A held button keeps the pointer, and movement beyond the edges clamps.
    await page.mouse.down();
    await page.mouse.move(x, canvas.y - 40, { steps: 4 });
    await expect.poll(async () => (await snapshot(page)).axes[slot]).toBe(-32768);
    // Release back inside the page, above the display. Playwright's Firefox
    // never delivers a mouseup outside the viewport (and reports the drag there
    // with no buttons held), so capture would outlive the release and swallow
    // the next click; real Firefox receives an outside release from the OS.
    expect(canvas.y).toBeGreaterThanOrEqual(2);
    await page.mouse.move(x, canvas.y / 2, { steps: 2 });
    await page.mouse.up();
    expect((await snapshot(page)).axes[slot]).toBe(-32768);
    expect((await snapshot(page)).axes[1 - slot]).toBe(other);
    expect((await snapshot(page)).pointerCount).toBe(0);
  }
  // Off: mouse movement over the display leaves both paddles alone.
  await openSettings(page);
  await page.getByTestId('mouse-slot').selectOption('off');
  await resumePlay(page);
  const before = await snapshot(page);
  await page.mouse.move(x, canvas.y + canvas.height * 0.3, { steps: 3 });
  await page.mouse.move(x, canvas.y + canvas.height * 0.7, { steps: 3 });
  await waitSimulation(page, BigInt(before.timeps) + 200_000_000_000n);
  expect((await snapshot(page)).axes).toEqual(before.axes);
  // Keyboard play is unaffected by a resting mouse after a menu closes.
  await openSettings(page);
  await page.getByTestId('mouse-slot').selectOption('0');
  await resumePlay(page);
  const resting = await snapshot(page);
  await waitSimulation(page, BigInt(resting.timeps) + 200_000_000_000n);
  expect((await snapshot(page)).axes).toEqual(resting.axes);
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).axes[0]).toBeGreaterThan(resting.axes[0]);
  await page.keyboard.up('s');
});

test('a missing Wasm asset produces an actionable error instead of simulated gameplay', async ({ page }, testInfo) => {
  // Fail real worker HTTP requests on every engine, including Firefox, where
  // Playwright route interception does not cover the worker's Wasm download.
  const fixture = await missingWasmServer();
  try {
    await page.goto(`${fixture.url}?debug`);
    await page.getByTestId('play-pong').click();
    await expect(page.getByTestId('error')).toBeVisible({ timeout: 30_000 });
    const missingRequestTarget = fixture.log().match(/"GET (\/NoCPU\/core\/nocpu\.wasm(?:\?[^ ]*)?) HTTP\/1\.1" 404/)?.[1];
    expect(missingRequestTarget).toBeDefined();
    const missingUrl = new URL(missingRequestTarget!, fixture.url);
    expect(missingUrl.pathname).toBe('/NoCPU/core/nocpu.wasm');
    expect(missingUrl.searchParams.get('nocpu_wasm_sha256')).toBe(fixture.wasmSha256);
    expect([...missingUrl.searchParams.keys()]).toEqual(['nocpu_wasm_sha256']);
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

test('audio interruption and visibility loss pause safely and recover from a new gesture', { tag: '@game-pong' }, async ({ page }) => {
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

test('an unresolved audio resume cannot freeze play and sound retry recovers safely', { tag: '@game-pong' }, async ({ page }) => {
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

test('a delayed valid audio activation recovers sound while play continues', { tag: '@game-pong' }, async ({ page }, testInfo) => {
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

test('backgrounding cancels a pending audio gesture before it completes', { tag: '@game-pong' }, async ({ page }) => {
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

test('a sustained browser session generates circuit scoring and bounded media', { tag: '@game-pong' }, async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  // Park both paddles at the top with the keyboard so the ball scores.
  await page.keyboard.down('w');
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => Math.max(...(await snapshot(page)).axes), { timeout: 15_000 }).toBeLessThan(-30000);
  await page.keyboard.up('w');
  await page.keyboard.up('ArrowUp');
  const initial = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  await page.waitForTimeout(8000);
  const final = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  const simulationSeconds = Number(BigInt(final.state.timePs) - BigInt(initial.state.timePs)) / 1e12;
  const wallSeconds = (final.wall - initial.wall) / 1000;
  const metrics = { simulationSeconds, wallSeconds, simulationSpeedRatio: simulationSeconds / wallSeconds,
    initialWasmMemoryCapacityBytes: initial.state.worker.wasmMemoryCapacityBytes,
    finalWasmMemoryCapacityBytes: final.state.worker.wasmMemoryCapacityBytes,
    audio: final.state.audio, worker: final.state.worker,
    evidenceScope: 'Eight-second headless desktop browser sample; not a performance qualification.' };
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

test('desktop window sizes keep the whole original raster and the action bar in view', { tag: '@game-pong' }, async ({ page }, testInfo) => {
  await start(page);
  const geometry: unknown[] = [];
  for (const size of [{ width: 1024, height: 600 }, { width: 1024, height: 768 }, { width: 1280, height: 720 },
    { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 800, height: 1000 }]) {
    await page.setViewportSize(size);
    await expect(page.getByTestId('game-canvas')).toBeVisible();
    await expectViewportShell(page);
    geometry.push(await expectDesktopLayout(page));
    for (const id of ['insert-coin', 'pause']) await expectUsableTarget(page, id);
    await page.screenshot({ path: testInfo.outputPath(`shell-play-${size.width}x${size.height}.png`) });
    await pauseMenu(page);
    for (const id of ['resume', 'reset']) await expectUsableTarget(page, id);
    for (const name of ['Settings', 'How to play', 'About']) await expectUsableTarget(page, name, true);
    await expectViewportShell(page);
    await page.screenshot({ path: testInfo.outputPath(`shell-pause-${size.width}x${size.height}.png`) });
    await resumePlay(page);
  }
  await testInfo.attach('desktop-layout-geometry.json', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
});

test('title and game menus support keyboard navigation without leaking gameplay input', { tag: '@game-pong' }, async ({ page }, testInfo) => {
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
  await page.setViewportSize({ width: 1024, height: 480 });
  await page.getByRole('link', { name: 'Credits & notices', exact: true }).scrollIntoViewIfNeeded();
  for (const name of ['Source', 'GPL v3', 'Credits & notices']) {
    const bounds = await page.getByRole('link', { name, exact: true }).boundingBox();
    expect(bounds, name).not.toBeNull();
    expect(bounds!.y, `${name} is reachable within About`).toBeGreaterThanOrEqual(-1);
    expect(bounds!.y + bounds!.height, `${name} is reachable within About`).toBeLessThanOrEqual(481);
  }
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath('shell-about-short-window-source-links.png') });
  await page.getByTestId('back').scrollIntoViewIfNeeded();
  await expectUsableTarget(page, 'back');
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath('shell-about-short-window-back.png') });
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

test('returning to the title stops playback and starting again creates a fresh circuit', { tag: '@game-pong' }, async ({ page }, testInfo) => {
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
  // The build string is vX.Y.Z for the release tag build, otherwise vX.Y.Z-dev.<shortsha>.
  const build = manifest.stage === 'release' && manifest.tag === `v${version}` ? `v${version}`
    : manifest.source_commit ? `v${version}-dev.${manifest.source_commit.slice(0, 7)}` : `v${version}-dev`;
  await expect(page.getByTestId('version')).toHaveText(build);
  await page.getByTestId('back').click();
  await expect(page.getByTestId('title-version')).toHaveText(build);
  await openAbout(page);
  const base = new URL(page.url()).pathname;
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', `${base}${manifest.source_archive.path}`);
  await expect(page.getByRole('link', { name: 'GPL v3', exact: true })).toHaveAttribute('href', `${base}notices/LICENSE`);
  await expect(page.getByRole('link', { name: 'Credits & notices', exact: true })).toHaveAttribute('href', `${base}notices/THIRD_PARTY_NOTICES.md`);
  await expect(page.getByRole('link', { name: 'DICE', exact: true })).toBeVisible();
});
