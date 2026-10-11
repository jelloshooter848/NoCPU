// SPDX-License-Identifier: GPL-3.0-or-later
// Opt-in report tests exercise software only; emulated profiles never qualify phones.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { paddles, snapshot, start, pauseMenu, waitSimulation, installAudioProbe, expectViewportShell } from './helpers';

async function openQualification(page: Page): Promise<void> {
  await pauseMenu(page);
  await page.getByTestId('menu-qualification').click();
  await expect(page.getByTestId('qualification-panel')).toBeVisible();
  await expectVisibleQualificationFocus(page);
}

async function expectVisibleQualificationFocus(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null;
    const panel = document.querySelector('[data-testid="qualification-panel"]');
    if (!focused || (!panel?.contains(focused) && focused.dataset.testid !== 'back')) return false;
    const bounds = focused.getBoundingClientRect();
    return !focused.closest('[hidden]') && !focused.matches(':disabled') && bounds.width > 0 && bounds.height > 0;
  })).toBe(true);
}

async function report(page: Page): Promise<any> {
  await expect(page.getByTestId('qualification-report')).not.toHaveValue('');
  return JSON.parse(await page.getByTestId('qualification-report').inputValue());
}

async function expectReachableControl(page: Page, id: string): Promise<void> {
  const control = page.getByTestId(id); await control.scrollIntoViewIfNeeded(); await control.focus();
  await expect(control).toBeFocused();
  const observed = await control.evaluate((node) => {
    const box = node.getBoundingClientRect(), back = document.querySelector('[data-testid="back"]')!.getBoundingClientRect();
    const x = box.x + box.width / 2, y = Math.max(box.y + 1, Math.min(innerHeight - 1, box.y + box.height / 2));
    const hit = document.elementFromPoint(x, y);
    return { left: box.left, right: box.right, top: box.top, backBottom: back.bottom, height: box.height,
      width: innerWidth, hit: hit === node || node.contains(hit) };
  });
  expect(observed.left).toBeGreaterThanOrEqual(0); expect(observed.right).toBeLessThanOrEqual(observed.width);
  expect(observed.top + .001).toBeGreaterThanOrEqual(observed.backBottom); expect(observed.height + .001).toBeGreaterThanOrEqual(44);
  expect(observed.hit, `${id} must have an unobstructed real hit target`).toBe(true);
}

async function beginRecording(page: Page): Promise<void> {
  await start(page); await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await openQualification(page); await expect(page.getByTestId('qualification-start')).toBeEnabled();
  await expectVisibleQualificationFocus(page); await page.getByTestId('qualification-start').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  await snapshot(page); // Ordered worker reply confirms the initial recorder query can settle.
}

test('ordinary play has no qualification UI, recorder snapshots or runtime verification downloads', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as any;
    target.__qualificationCommands = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...args: any[]): void {
      if (message?.type === 'snapshot') target.__qualificationCommands.push(message.type);
      Reflect.apply(post, this, [message, ...args]);
    };
  });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto('./');
  await expect(page.getByTestId('open-qualification')).toHaveCount(0);
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => { try { await paddles(page); return true; } catch { return false; } }).toBe(true);
  await page.getByTestId('pause').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await expect(page.getByTestId('resume')).toBeVisible();
  await expect(page.getByTestId('menu-qualification')).toHaveCount(0);
  await expect(page.getByTestId('qualification-panel')).toHaveCount(0);
  expect(await page.evaluate(() => ({ debug: typeof (window as any).__nocpuDebug, snapshots: (window as any).__qualificationCommands })))
    .toEqual({ debug: 'undefined', snapshots: [] });
  expect(requests.filter((name) => name.endsWith('/BUILD-MANIFEST.json')).length).toBeLessThanOrEqual(1);
  expect(requests.filter((name) => name.endsWith('/core/nocpu.wasm'))).toHaveLength(1);
  expect(requests.filter((name) => name.includes('/source/') || name.includes('/notices/'))).toEqual([]);
});

test('qualification identity failure blocks Start and explicit retry recovers without blocking Pong', async ({ page }) => {
  let releasePreflight: (() => void) | undefined;
  let deferPreflight = false;
  await page.route('**/BUILD-MANIFEST.json', async (route) => {
    if (deferPreflight) await new Promise<void>((resolve) => { releasePreflight = resolve; });
    await route.abort('failed');
  });
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  deferPreflight = true;
  await openQualification(page);
  await expect(page.getByTestId('qualification-status')).toContainText('Checking build identity');
  await expectVisibleQualificationFocus(page);
  await expect.poll(() => Boolean(releasePreflight)).toBe(true);
  releasePreflight!();
  await expect(page.getByTestId('qualification-start')).toBeDisabled();
  await expect(page.getByTestId('qualification-status')).toContainText(/identity|manifest|prepare|unavailable|failed/i);
  await expect(page.getByTestId('qualification-prepare')).toBeEnabled();
  await page.unroute('**/BUILD-MANIFEST.json');
  await page.getByTestId('qualification-prepare').click();
  await expect(page.getByTestId('qualification-start')).toBeEnabled();
  await page.getByTestId('back').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await page.getByTestId('resume').click();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
});

test('short native recording keeps software scopes and fixed measurements through annotation, failed export and recovery', async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await page.addInitScript(() => {
    const target = window as any; target.__qualificationDraws = 0;
    const draw = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (...args: any[]): void { target.__qualificationDraws += 1; Reflect.apply(draw, this, args); };
  });
  await beginRecording(page); const initial = await snapshot(page);
  await waitSimulation(page, BigInt(initial.timeps) + 2_500_000_000_000n);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(4800);
  await expect.poll(() => page.evaluate(() => (window as any).__qualificationDraws)).toBeGreaterThan(3);
  await openQualification(page); await expectVisibleQualificationFocus(page);
  await page.getByTestId('qualification-model').focus();
  await page.getByTestId('qualification-status').evaluate((node) => new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => { observer.disconnect(); resolve(); });
    observer.observe(node, { childList: true });
  }));
  await expect(page.getByTestId('qualification-model')).toBeFocused();
  await page.getByTestId('qualification-finish').click(); const original = await report(page);
  expect(original.release_ready).toBe(false); expect(original.device.physical).toBeNull(); expect(original.observations).toEqual({});
  expect(original.performance.wall_seconds).toBeGreaterThan(0);
  expect(original.performance.wall_seconds).toBeLessThanOrEqual(original.performance.session_seconds);
  expect(original.performance.simulation_seconds).toBeGreaterThan(0); expect(original.performance.native_frames).toBeGreaterThan(0);
  expect(original.performance.duration_requirement_met).toBe(false);
  expect(original.performance.frame_pacing.count).toBeGreaterThan(0);
  expect(original.performance.frame_pacing.method).toMatch(/opportunities.*not.*rendered FPS/i);
  expect(original.performance.memory_scope).toMatch(/Wasm.*capacity.*not.*browser/i);
  expect(original.samples.every((sample: any) => /^\d+$/.test(sample.state.timePs))).toBe(true);
  expect(original.manifest_start.served_runtime_verified).toBe(true);
  expect(original.manifest_start.scope).toMatch(/no loaded-memory.*physical-device/i);
  const measured = JSON.stringify({ samples: original.samples, segments: original.segments, audio: original.performance.audio_deltas,
    seconds: original.performance.simulation_seconds, wall: original.performance.wall_seconds });
  await page.getByTestId('qualification-physical').selectOption('no');
  await page.getByTestId('qualification-model').fill('Automated software profile');
  await page.getByTestId('qualification-observations').fill('Automation only; speaker and hands-on touch remain untested.');
  await page.getByTestId('qualification-input-response').fill('No hardware latency result.');
  const annotated = await report(page);
  expect(annotated.device.physical).toBe(false); expect(annotated.device.model).toBe('Automated software profile');
  expect(annotated.performance.input_response).toBe('No hardware latency result.'); expect(annotated.release_ready).toBe(false);
  expect(JSON.stringify({ samples: annotated.samples, segments: annotated.segments, audio: annotated.performance.audio_deltas,
    seconds: annotated.performance.simulation_seconds, wall: annotated.performance.wall_seconds })).toBe(measured);
  await page.setViewportSize({ width: 844, height: 390 }); await expectViewportShell(page);
  for (const id of ['qualification-export', 'qualification-copy', 'qualification-report']) await expectReachableControl(page, id);
  await page.screenshot({ path: testInfo.outputPath('qualification-finished-landscape.png') });
  await page.evaluate(() => {
    const target = window as any; target.__restoreQualificationBlob = URL.createObjectURL;
    URL.createObjectURL = () => { throw new Error('Synthetic Blob download denial'); };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Synthetic clipboard denial')) } });
  });
  await page.getByTestId('qualification-export').click();
  await expect(page.getByTestId('qualification-export-status')).toContainText('Download is unavailable');
  await page.getByTestId('qualification-copy').click();
  await expect(page.getByTestId('qualification-export-status')).toContainText('Clipboard is unavailable');
  expect(await page.getByTestId('qualification-report').evaluate((node) => {
    const field = node as HTMLTextAreaElement; return field.selectionStart === 0 && field.selectionEnd === field.value.length;
  })).toBe(true);
  await page.evaluate(() => { URL.createObjectURL = (window as any).__restoreQualificationBlob; });
  const downloaded = page.waitForEvent('download'); await page.getByTestId('qualification-export').click();
  const download = await downloaded; expect(download.suggestedFilename()).toMatch(/^nocpu-qualification-.*\.json$/);
  const filename = await download.path(); expect(filename).not.toBeNull();
  expect(JSON.parse(readFileSync(filename!, 'utf8'))).toEqual(annotated);
  await page.getByTestId('back').click(); await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await expect(page.getByTestId('menu-qualification')).toBeFocused();
  await page.getByTestId('menu-qualification').click(); expect(await report(page)).toEqual(annotated);
  await expectVisibleQualificationFocus(page);
  await testInfo.attach('qualification-software-report.json', { body: Buffer.from(JSON.stringify(annotated, null, 2)), contentType: 'application/json' });
});

test('rapid lifecycle, reset and fresh worker boundaries remain visible and never bridge native clocks', async ({ page }, testInfo) => {
  await beginRecording(page); let baseline = await snapshot(page);
  await waitSimulation(page, BigInt(baseline.timeps) + 1_500_000_000_000n);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('reset').click(); await page.getByTestId('resume').click();
  await expect.poll(async () => (await snapshot(page)).attract).toBe(true);
  await page.getByTestId('insert-coin').click(); await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  baseline = await snapshot(page); await waitSimulation(page, BigInt(baseline.timeps) + 1_500_000_000_000n);
  await pauseMenu(page); await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await page.getByTestId('play-pong').click(); await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await page.getByTestId('insert-coin').click(); await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  baseline = await snapshot(page); await waitSimulation(page, BigInt(baseline.timeps) + 1_500_000_000_000n);
  await openQualification(page); await page.getByTestId('qualification-finish').click(); const observed = await report(page);
  expect(observed.events.some((event: any) => event.reason === 'hidden')).toBe(true);
  expect(observed.events.some((event: any) => event.reason === 'visible')).toBe(true);
  expect(new Set(observed.samples.map((sample: any) => sample.state.identity.generation)).size).toBeGreaterThan(1);
  expect(observed.excluded_intervals.length).toBeGreaterThan(0);
  for (const segment of observed.segments) {
    const first = observed.samples[segment.from_sample], last = observed.samples[segment.to_sample];
    expect(last.state.identity.generation).toBe(first.state.identity.generation);
    expect(last.state.identity.resetId).toBe(first.state.identity.resetId);
    expect(last.state.identity.clockEpoch).toBe(first.state.identity.clockEpoch);
    expect(BigInt(last.state.timePs)).toBeGreaterThanOrEqual(BigInt(first.state.timePs));
  }
  expect(observed.release_ready).toBe(false); expect(observed.performance.duration_requirement_met).toBe(false);
  await testInfo.attach('qualification-lifecycle-software.json', { body: Buffer.from(JSON.stringify(observed, null, 2)), contentType: 'application/json' });
});

test('an actual unanswered worker observation exports partial errors and retains the report after returning to title', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...args: any[]): void {
      if ((window as any).__qualificationDropSnapshots && message?.type === 'snapshot') return;
      Reflect.apply(post, this, [message, ...args]);
    };
  });
  await beginRecording(page);
  await page.evaluate(() => { (window as any).__qualificationDropSnapshots = true; });
  await expect(page.getByTestId('qualification-status')).toContainText('Collection error', { timeout: 15_000 });
  await page.evaluate(() => { (window as any).__qualificationDropSnapshots = false; });
  await openQualification(page); await page.getByTestId('qualification-finish').click(); const observed = await report(page);
  expect(observed.coverage_complete).toBe(false); expect(observed.collection_errors.join(' ')).toMatch(/did not answer/);
  expect(observed.performance.duration_requirement_met).toBe(false); expect(observed.performance.speed_requirement_met).toBe(false);
  await page.getByTestId('back').click(); await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await page.getByTestId('open-qualification').click(); expect(await report(page)).toEqual(observed);
  await expectVisibleQualificationFocus(page); await page.getByTestId('back').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'title');
  await expect(page.getByTestId('open-qualification')).toBeFocused();
});

test('actual core loading ignores stale unkeyed responses and served-byte tamper blocks identity before recording', async ({ page, request, browserName }) => {
  const manifestResponse = await request.get('BUILD-MANIFEST.json'); expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  const jsHash = manifest.runtime_files.find((file: any) => file.path === 'core/nocpu.js').sha256;
  const wasmHash = manifest.runtime_files.find((file: any) => file.path === 'core/nocpu.wasm').sha256;
  await page.addInitScript(() => {
    const target = window as any; target.__qualificationLoaderUrls = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...args: any[]): void {
      if (message?.type === 'init') target.__qualificationLoaderUrls.push(message.moduleUrl);
      Reflect.apply(post, this, [message, ...args]);
    };
  });
  const keyed: string[] = [], stale: string[] = []; let tamper = false;
  // Worker routing differs between engines. Observe executed request URLs
  // independently; served-byte fault injection below targets main-thread preflight.
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!/\/core\/nocpu\.(?:js|wasm)$/.test(url.pathname)) return;
    (url.search ? keyed : stale).push(url.href);
  });
  await page.route('**/core/nocpu.*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.search) await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'throw Error("Synthetic stale unkeyed cache");' });
    else if (tamper && url.pathname.endsWith('.wasm')) await route.fulfill({ status: 200, contentType: 'application/wasm', body: Buffer.from('tampered served Wasm') });
    else await route.continue();
  });
  await start(page); await page.getByTestId('insert-coin').click(); await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  expect(stale).toEqual([]);
  const loaderUrls = await page.evaluate(() => (window as any).__qualificationLoaderUrls as string[]);
  expect(loaderUrls).toHaveLength(1);
  const loader = new URL(loaderUrls[0]); expect(loader.pathname).toMatch(/\/NoCPU\/core\/nocpu\.js$/);
  expect(loader.searchParams.get('nocpu_js_sha256')).toBe(jsHash); expect(loader.searchParams.get('nocpu_wasm_sha256')).toBe(wasmHash);
  const observedKeyedJs = (): boolean => keyed.some((value) => {
    const url = new URL(value); return url.pathname.endsWith('.js') && url.searchParams.get('nocpu_js_sha256') === jsHash && url.searchParams.get('nocpu_wasm_sha256') === wasmHash;
  });
  // Firefox omits worker dynamic-import JS from page request events. Its actual
  // launch URL and Wasm request stay asserted; preflight observes JS on all engines.
  if (browserName !== 'firefox') expect(observedKeyedJs()).toBe(true);
  expect(keyed.some((value) => { const url = new URL(value); return url.pathname.endsWith('.wasm') && url.searchParams.get('nocpu_wasm_sha256') === wasmHash && !url.searchParams.has('nocpu_js_sha256'); })).toBe(true);
  tamper = true; await openQualification(page);
  await expect(page.getByTestId('qualification-status')).toContainText(/does not match manifest/);
  await expect.poll(observedKeyedJs).toBe(true);
  await expect(page.getByTestId('qualification-start')).toBeDisabled();
  tamper = false; await page.getByTestId('qualification-prepare').click(); await expect(page.getByTestId('qualification-start')).toBeEnabled();
  expect(stale).toEqual([]);
});

test('qualification form and report remain reachable with visible focus in compact portrait and landscape panels', async ({ page }, testInfo) => {
  await page.goto('./?debug'); await page.getByTestId('open-qualification').click();
  await expect(page.getByTestId('qualification-panel')).toBeVisible();
  await expect(page.getByTestId('qualification-status')).toContainText('Prepare Pong first');
  await expect(page.getByTestId('qualification-play')).toBeVisible();
  await expect(page.getByTestId('qualification-prepare')).toBeHidden();
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await expectViewportShell(page);
    for (const id of ['qualification-physical', 'qualification-model', 'qualification-controller', 'qualification-observations', 'qualification-input-response', 'qualification-notes']) {
      await expectReachableControl(page, id);
    }
    await page.screenshot({ path: testInfo.outputPath(`qualification-${size.width}x${size.height}.png`) });
  }
  await page.getByTestId('back').click(); await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'title');
  await expect(page.getByTestId('open-qualification')).toBeFocused();
});
