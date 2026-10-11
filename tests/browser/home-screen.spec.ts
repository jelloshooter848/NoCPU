// SPDX-License-Identifier: GPL-3.0-or-later
// Display signals, safe insets and page lifecycle events below are simulated.
// Actual iPhone installation, storage sharing/retention and speaker sound remain separate device checks.
import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { installAudioProbe, expectViewportShell, expectUsableTarget } from './helpers';
import { titleSettings, importZip, storedArchive } from './app-helpers';
import { syntheticGameZip } from './rom-fixtures';
import { activateGame, launchFromLibrary, gameSnapshot, gamePause, externalControls, advanceGame } from './v040-game-helpers';
import { expectBreakoutGeometry } from './v050-breakout-helpers';

const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

async function softwareHomeScreenSignal(page: Page, kind: 'media' | 'safari' = 'media', initial = true): Promise<void> {
  await page.addInitScript(({ kind, initial }) => {
    const state = { kind, active: initial, fullscreenRequests: 0 };
    const nativeMatchMedia = window.matchMedia.bind(window);
    const display = new EventTarget() as MediaQueryList;
    Object.defineProperties(display, {
      media: { value: '(display-mode: standalone)' },
      matches: { get: () => kind === 'media' && state.active },
      onchange: { writable: true, value: null },
      addListener: { value: (listener: EventListener) => display.addEventListener('change', listener) },
      removeListener: { value: (listener: EventListener) => display.removeEventListener('change', listener) },
    });
    window.matchMedia = (query) => query === '(display-mode: standalone)' ? display : nativeMatchMedia(query);
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => kind === 'safari' && state.active });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    Element.prototype.requestFullscreen = async () => { state.fullscreenRequests++; throw new DOMException('Fullscreen deliberately unavailable in this software profile', 'NotSupportedError'); };
    (window as any).__homeScreenSoftware = state;
    (window as any).__setHomeScreenSoftware = (active: boolean) => { state.active = active; display.dispatchEvent(new Event('change')); };
  }, { kind, initial });
}
async function aboutGuide(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'About', exact: true }).click();
  const guide = page.getByTestId('home-screen-about');
  if (!await guide.evaluate((element) => (element as HTMLDetailsElement).open)) await guide.locator('summary').click();
}

test('Home Screen install identity, launch scope and opaque Apple icons are served beneath the actual project base', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByTestId('title-version')).toHaveText(`V${version}`);
  const metadata = await page.evaluate(() => ({
    page: location.href,
    manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href,
    appleIcon: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href,
    capable: document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-capable"]')?.content,
    title: document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')?.content,
    status: document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
    viewport: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content,
  }));
  const base = new URL('./', metadata.page);
  expect(metadata.capable).toBe('yes'); expect(metadata.title).toBe('NoCPU'); expect(metadata.status).toBe('black-translucent');
  expect(metadata.viewport).toContain('viewport-fit=cover');
  expect(metadata.manifest).toBe(new URL('manifest.webmanifest', base).href);
  expect(metadata.appleIcon).toBe(new URL('icons/apple-touch-icon.png', base).href);
  const response = await page.request.get(metadata.manifest!); expect(response.ok()).toBe(true);
  const manifestBytes = await response.body(); const manifest = JSON.parse(manifestBytes.toString());
  expect(manifest.name).toBe('NoCPU'); expect(manifest.short_name).toBe('NoCPU'); expect(manifest.display).toBe('standalone');
  for (const field of ['start_url', 'scope']) {
    expect(new URL(manifest[field], metadata.manifest).href).toBe(base.href);
  }
  // The manifest id base is the start URL's origin, not the manifest directory.
  // Release packaging deliberately supports the canonical /NoCPU/ project path.
  const startUrl = new URL(manifest.start_url, metadata.manifest);
  expect(new URL(manifest.id, startUrl.origin).href).toBe(base.href);
  expect(manifest.theme_color).toBe('#000000'); expect(manifest.background_color).toBe('#000000');
  const files = [{ url: metadata.manifest!, bytes: manifestBytes }];
  const icons = [{ url: metadata.appleIcon!, size: 180 }, ...manifest.icons.map((icon: any) => {
    expect(icon.type).toBe('image/png'); expect(icon.purpose).toBe('any');
    expect(['192x192', '512x512']).toContain(icon.sizes);
    return { url: new URL(icon.src, metadata.manifest).href, size: Number(icon.sizes.split('x')[0]) };
  })];
  expect(icons.map((icon) => icon.size).sort((a, b) => a - b)).toEqual([180, 192, 512]);
  for (const icon of icons) {
    expect(new URL(icon.url).pathname.startsWith(base.pathname)).toBe(true);
    const imageResponse = await page.request.get(icon.url); expect(imageResponse.ok()).toBe(true);
    expect(imageResponse.headers()['content-type']).toContain('image/png');
    const bytes = await imageResponse.body(); expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(bytes.readUInt32BE(16)).toBe(icon.size); expect(bytes.readUInt32BE(20)).toBe(icon.size);
    expect(bytes[25], 'Install PNGs must have opaque RGB encoding rather than an alpha channel').toBe(2);
    const decoded = await page.evaluate(async (url) => {
      const image = new Image(); image.src = url; await image.decode(); return [image.naturalWidth, image.naturalHeight];
    }, icon.url);
    expect(decoded).toEqual([icon.size, icon.size]); files.push({ url: icon.url, bytes });
  }
  if (process.env.NOCPU_TEST_PACKAGED === '1') {
    const packaged = await page.request.get(new URL('BUILD-MANIFEST.json', base).href); expect(packaged.ok()).toBe(true);
    const inventory = (await packaged.json()).runtime_files;
    for (const file of files) {
      const path = new URL(file.url).pathname.slice(base.pathname.length);
      expect(inventory.find((entry: any) => entry.path === path)).toMatchObject({ size: file.bytes.length, sha256: sha256(file.bytes) });
    }
  }
  await testInfo.attach('home-screen-served-install-assets.json', { body: Buffer.from(JSON.stringify({ metadata, manifest,
    files: files.map((file) => ({ url: file.url, size: file.bytes.length, sha256: sha256(file.bytes) })), physicalInstallation: false }, null, 2)), contentType: 'application/json' });
});

test('browser and both software Home Screen signals give discreet truthful help without automatic launch or fullscreen', async ({ page, context }, testInfo) => {
  await softwareHomeScreenSignal(page, 'media', false); await page.goto('./?debug');
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'title');
  await expect(page.locator('.game-shell')).toHaveAttribute('data-display-mode', 'browser');
  await aboutGuide(page);
  const guide = page.getByTestId('home-screen-about');
  await expect(guide.locator('[data-home-screen-steps]')).toBeVisible(); await expect(guide).toContainText('Share');
  await expect(guide).toContainText('Add to Home Screen'); await expect(guide).toContainText('does not add offline play');
  await expect(guide).toContainText('may have separate saved data'); await expect(guide).toContainText('Save a backup');
  await page.evaluate(() => (window as any).__setHomeScreenSoftware(true));
  await expect(page.locator('.game-shell')).toHaveAttribute('data-display-mode', 'standalone');
  await expect(guide.locator('[data-home-screen-status]')).toHaveText('NoCPU is running in Home Screen view.');
  await expect(guide.locator('[data-home-screen-steps]')).toBeHidden();
  await page.getByTestId('back').click(); await expect(page.getByTestId('title-version')).toHaveText(`V${version}`);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await page.getByTestId('home-screen-help').locator('summary').click();
  await expect(page.getByTestId('home-screen-help')).toContainText('Home Screen view');
  await expect(page.getByTestId('home-screen-help')).toContainText('Closing the app can end the current game');
  expect(await page.evaluate(() => (window as any).__homeScreenSoftware.fullscreenRequests)).toBe(0);
  const safari = await context.newPage();
  try {
    await softwareHomeScreenSignal(safari, 'safari'); await safari.goto('./');
    await expect(safari.locator('.game-shell')).toHaveAttribute('data-display-mode', 'standalone');
    await expect(safari.locator('.game-shell')).toHaveAttribute('data-screen', 'title');
    await aboutGuide(safari); await expect(safari.getByTestId('home-screen-about').locator('[data-home-screen-steps]')).toBeHidden();
  } finally { await safari.close(); }
  await testInfo.attach('home-screen-detection-scope.json', { body: Buffer.from(JSON.stringify({ displayMode: 'synthetic media signal',
    safariMode: 'synthetic navigator.standalone signal', physicalInstallation: false, automaticFullscreen: false })), contentType: 'application/json' });
});

test('software Home Screen portrait and landscape keep every playable circuit and external controls within simulated safe areas', async ({ page }, testInfo) => {
  await softwareHomeScreenSignal(page); const geometry: unknown[] = [];
  for (const [index, gameId] of (['pong', 'pongdoubles', 'spacerace', 'breakout'] as const).entries()) {
    await launchFromLibrary(page, gameId, index === 0); await activateGame(page, gameId);
    for (const [size, safe] of [
      [{ width: 390, height: 844 }, { top: 47, right: 0, bottom: 34, left: 0 }],
      [{ width: 844, height: 390 }, { top: 0, right: 47, bottom: 21, left: 47 }],
    ] as const) {
      await page.setViewportSize(size);
      await page.evaluate((safe) => { for (const [edge, value] of Object.entries(safe)) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`); }, safe);
      await expect(page.locator('.game-shell')).toHaveAttribute('data-display-mode', 'standalone');
      await expectViewportShell(page); geometry.push(gameId === 'breakout' ? await expectBreakoutGeometry(page, safe) : await externalControls(page, gameId, safe));
      for (const id of ['insert-coin', ...(gameId === 'pong' ? [] : ['start-game']), ...(gameId === 'breakout' ? ['start-game-2', 'serve-game'] : []), 'pause']) await expectUsableTarget(page, id);
      await page.screenshot({ path: testInfo.outputPath(`${gameId}-software-home-screen-${size.width}x${size.height}.png`) });
      await gamePause(page); await aboutGuide(page); await expectViewportShell(page);
      await expect(page.getByTestId('home-screen-about').locator('[data-home-screen-status]')).toBeVisible();
      await page.getByTestId('back').click(); await page.getByTestId('resume').click();
    }
  }
  expect(await page.evaluate(() => (window as any).__homeScreenSoftware.fullscreenRequests)).toBe(0);
  await testInfo.attach('home-screen-software-safe-area-geometry.json', { body: Buffer.from(JSON.stringify({ physicalInstallation: false,
    insets: 'synthetic CSS reservations, not measured iPhone safe areas', geometry }, null, 2)), contentType: 'application/json' });
});

test('software Home Screen restored-page and viewport recovery release input, clear queued audio and require explicit Resume', async ({ page }, testInfo) => {
  await softwareHomeScreenSignal(page); await installAudioProbe(page); await launchFromLibrary(page, 'pong'); await activateGame(page, 'pong');
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.started)).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  const control = page.getByTestId('paddle-p1'), bounds = (await control.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await expect.poll(async () => (await gameSnapshot(page)).pointerCount).toBe(1);
  await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));
  await expect.poll(async () => (await gameSnapshot(page)).pointerCount).toBe(0); await page.mouse.up();
  await page.keyboard.down('KeyW'); await expect.poll(async () => (await gameSnapshot(page)).heldKeys).toContain('KeyW');
  const before = await gameSnapshot(page);
  // This deliberately omits pagehide, so pageshow itself must close stale input/audio.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, 0]);
  await expect.poll(async () => (await gameSnapshot(page)).heldKeys).toEqual([]);
  const restored = await gameSnapshot(page); expect(restored.paused).toBe(true); expect(restored.generation).toBe(before.generation);
  expect(restored.resetId).toBe(before.resetId); expect(restored.coin).toBe(false); expect(restored.start).toBe(false);
  const scheduled = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.waitForTimeout(150); const stable = await gameSnapshot(page);
  expect(stable.timeps).toBe(restored.timeps); expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(scheduled);
  await page.keyboard.up('KeyW'); await page.getByTestId('resume').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing'); await advanceGame(page, 100000);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.started)).toBeGreaterThan(scheduled);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await page.getByTestId('resume').click(); await page.keyboard.down('KeyW');
  await expect.poll(async () => (await gameSnapshot(page)).directions[0]).toBe(-1); await page.keyboard.up('KeyW');
  await testInfo.attach('home-screen-software-recovery.json', { body: Buffer.from(JSON.stringify({ before, restored, stable,
    afterResume: await gameSnapshot(page), lifecycleEvents: 'synthetically dispatched; no actual OS suspension',
    audio: 'native Web Audio scheduling, not physical speaker sound', physicalInstallation: false }, null, 2)), contentType: 'application/json' });
});

test('software Home Screen relaunch keeps chosen settings and private synthetic storage while recovery works when storage is denied', async ({ page, context }, testInfo) => {
  await softwareHomeScreenSignal(page, 'safari'); await page.goto('./?debug'); await titleSettings(page);
  await page.locator('#volume').fill('37'); await page.getByTestId('binding-p1Up').click(); await page.keyboard.press('KeyJ');
  await page.getByTestId('settings-game').selectOption('pongdoubles'); await page.getByTestId('winning-score').selectOption('15');
  const archive = syntheticGameZip('antiaircraft', 17);
  await importZip(page, 'antiaircraft', 'synthetic-storage-only.zip', archive, true);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Saved on this device');
  const preferences = await page.evaluate(() => localStorage.getItem('nocpu.preferences'));
  const stored = await storedArchive(page, 'read'); expect(stored.bytes).toEqual([...archive]);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect(await page.evaluate(() => localStorage.getItem('nocpu.preferences'))).toBe(preferences);
  await page.reload(); await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'title'); await titleSettings(page);
  await expect(page.locator('#volume')).toHaveValue('37'); await expect(page.getByTestId('binding-p1Up')).toHaveText('J');
  await page.getByTestId('settings-game').selectOption('pongdoubles'); await expect(page.getByTestId('winning-score')).toHaveValue('15');
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Saved on this device'); expect(await storedArchive(page, 'read')).toEqual(stored);
  await page.getByTestId('back').click(); await page.getByTestId('open-library').click(); await page.getByTestId('game-antiaircraft').click();
  await expect(page.getByTestId('play-selected')).toBeDisabled();
  const denied = await context.newPage();
  try {
    await softwareHomeScreenSignal(denied); await denied.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Synthetic denied storage', 'SecurityError'); } });
      Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Synthetic denied storage', 'SecurityError'); } });
    });
    await denied.goto('./?debug'); await titleSettings(denied);
    await expect(denied.getByTestId('preferences-status')).toContainText('unavailable');
    await denied.locator('#volume').fill('19'); await expect(denied.getByTestId('preferences-status')).toContainText('could not be saved');
    await denied.getByTestId('back').click(); await aboutGuide(denied); await expect(denied.getByTestId('home-screen-about')).toContainText('re-import');
    await denied.getByTestId('back').click(); await denied.getByTestId('play-pong').click(); await expect(denied.getByTestId('insert-coin')).toBeEnabled();
    await activateGame(denied, 'pong'); expect((await gameSnapshot(denied)).run).toBe(true);
  } finally { await denied.close(); }
  await testInfo.attach('home-screen-local-storage-scope.json', { body: Buffer.from(JSON.stringify({
    preferenceAndSyntheticArchivePreserved: true, syntheticArchiveEstablishesGameplay: false,
    deniedStorageStillAllowsRomFreePong: true, safariToInstalledStorageTransferTested: false, physicalInstallation: false })), contentType: 'application/json' });
});
