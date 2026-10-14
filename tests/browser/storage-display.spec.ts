// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic compatible checksums establish loader behavior, never game fidelity.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { auditedGames, invalidAntiAircraftZips, syntheticGameZip, syntheticDump, zip } from './rom-fixtures';
import { screen, titleSettings, importZip, storedArchive } from './app-helpers';
import { snapshot, start, expectViewportShell, waitSimulation } from './helpers';

test('preferences retain chosen sound settings and recover documented migrations, corruption and unsupported versions', async ({ page }) => {
  await page.goto('?debug');
  await titleSettings(page);
  await page.locator('#volume').fill('23');
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-label', 'Mute sound');
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!));
  expect(saved.version).toBe(5);
  expect(saved.preferences.volume).toBe(.23);
  expect(saved.preferences.muted).toBe(true);
  await page.reload();
  await titleSettings(page);
  await expect(page.locator('#volume')).toHaveValue('23');
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
  const unexpected = structuredClone(saved.preferences.bindings);
  unexpected.keyboard.p1Down = ['KeyC'];
  await page.evaluate((bindings) => localStorage.setItem('nocpu.preferences', JSON.stringify({
    version: 0, preferences: { volume: .31, muted: true, bindings } })), unexpected);
  await page.reload();
  await titleSettings(page);
  await expect(page.locator('#volume')).toHaveValue('31');
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('binding-p1Down'), 'Sound-only migration must ignore unexpected mapping fields').toHaveText('S');
  await expect(page.getByTestId('preferences-status')).toContainText('Older sound settings');
  for (const raw of ['{broken', JSON.stringify({ version: 999, preferences: saved.preferences }),
    JSON.stringify({ version: 1, preferences: { volume: 4, muted: 'yes', bindings: unexpected } }), 'x'.repeat(65537)]) {
    await page.evaluate((raw) => localStorage.setItem('nocpu.preferences', raw), raw);
    await page.reload();
    await titleSettings(page);
    await expect(page.locator('#volume')).toHaveValue('60');
    await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('preferences-status')).toContainText(/Defaults|defaults/);
    await expectViewportShell(page);
  }
  await page.evaluate(() => localStorage.removeItem('nocpu.preferences'));
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('binding-p1Down')).toHaveText('S');
  await page.getByTestId('back').click();
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
});

test('denied preference reads and writes leave sound controls and ROM-free play usable', async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Synthetic denied storage', 'SecurityError'); } });
  });
  await page.goto('?debug');
  await titleSettings(page);
  await expect(page.getByTestId('preferences-status')).toContainText('unavailable');
  await page.locator('#volume').fill('42');
  await expect(page.locator('#volume')).toHaveValue('42');
  await expect(page.getByTestId('preferences-status')).toContainText('could not be saved');
  await page.getByTestId('binding-p1Down').click();
  await page.keyboard.press('j');
  await expect(page.getByTestId('binding-p1Down')).toHaveText('J');
  await page.getByTestId('back').click();
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  const writableFailure = await context.newPage();
  try {
    await writableFailure.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new DOMException('Synthetic quota denial', 'QuotaExceededError'); };
    });
    await writableFailure.goto('./?debug');
    await titleSettings(writableFailure);
    await writableFailure.locator('#volume').fill('17');
    await expect(writableFailure.getByTestId('preferences-status')).toContainText('could not be saved');
    await expect(writableFailure.locator('#volume')).toHaveValue('17');
    await writableFailure.getByTestId('back').click();
    await writableFailure.getByTestId('play-pong').click();
    await expect(writableFailure.getByTestId('insert-coin')).toBeEnabled();
  } finally { await writableFailure.close(); }
});

test('valid local ZIPs remain private, unavailable ports stay pending and malformed replacements preserve the validated archive', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  await page.goto('?debug');
  await titleSettings(page);
  await page.waitForLoadState('networkidle');
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(`${request.method()} ${request.url()}`); });
  const valid = syntheticGameZip('antiaircraft', 0, 8);
  await importZip(page, 'antiaircraft', 'synthetic-compatible.zip', valid);
  await expect(page.getByTestId('rom-import-status')).toContainText('ROM validated');
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Available this session');
  expect(await storedArchive(page, 'read'), 'Default import must not persist bytes without affirmative Remember').toBeNull();
  for (const invalid of invalidAntiAircraftZips()) {
    await importZip(page, 'antiaircraft', invalid.name, invalid.buffer);
    await expect(page.getByTestId('rom-import-status'), invalid.name).not.toContainText('ROM validated');
    await expect(page.getByTestId('rom-item-antiaircraft'), invalid.name).toContainText('synthetic-compatible.zip');
    await expect(page.getByTestId('rom-item-antiaircraft'), invalid.name).toContainText('Available this session');
    await expectViewportShell(page);
  }
  const attack = auditedGames.find((game) => game.id === 'attack')!;
  const part = attack.roms[0].dump_variants[0];
  await importZip(page, 'attack', 'partial-set.zip', zip([{ name: attack.roms[0].expected_member, data: syntheticDump(part.crc32, part.size_bytes) }]));
  await expect(page.getByTestId('rom-import-status')).toContainText('Missing compatible bytes');
  await expect(page.getByTestId('rom-item-attack')).toHaveCount(0);
  const backup = page.waitForEvent('download');
  await page.getByTestId('export-antiaircraft').click();
  const downloaded = await backup;
  const path = await downloaded.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(valid);
  expect(requests, 'Local import/export must make no HTTP requests, including GET-based uploads').toEqual([]);
  await page.getByTestId('back').click();
  await page.getByTestId('open-library').click();
  await page.getByTestId('game-antiaircraft').click();
  await expect(page.getByTestId('game-rom-status')).toContainText('Validated locally');
  await expect(page.getByTestId('game-port-status')).toHaveText('Browser port pending');
  await expect(page.getByTestId('play-selected')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('validated-ROM-port-still-pending.png') });
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('rom-item-antiaircraft')).toHaveCount(0);
});

test('remembered ZIP replacement, corruption, eviction and remove recover from actual stored bytes', async ({ page }) => {
  const original = syntheticGameZip('antiaircraft', 1), replacement = syntheticGameZip('antiaircraft', 2, 8);
  await page.goto('?debug');
  await titleSettings(page);
  await importZip(page, 'antiaircraft', 'remembered.zip', original, true);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Saved on this device');
  expect((await storedArchive(page, 'read')).bytes).toEqual([...original]);
  const badReplacement = invalidAntiAircraftZips().find((fixture) => fixture.name === 'actual-crc-corruption.zip')!;
  await importZip(page, 'antiaircraft', badReplacement.name, badReplacement.buffer, true);
  await expect(page.getByTestId('rom-import-status')).not.toContainText('ROM validated');
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('remembered.zip');
  expect((await storedArchive(page, 'read')), 'Invalid remembered replacement must preserve exact prior bytes').toEqual({ fileName: 'remembered.zip', bytes: [...original] });
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('remembered.zip');
  await importZip(page, 'antiaircraft', 'session-replacement.zip', replacement, false);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Available this session');
  await expect(page.getByTestId('storage-status')).toContainText('older saved archive remains');
  expect((await storedArchive(page, 'read')).bytes).toEqual([...original]);
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('remembered.zip');
  await importZip(page, 'antiaircraft', 'replacement.zip', replacement, true);
  expect((await storedArchive(page, 'read')).bytes).toEqual([...replacement]);
  await page.evaluate(() => {
    (window as any).__originalRomDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function () { throw new DOMException('Synthetic delete denial', 'SecurityError'); };
  });
  await page.getByTestId('remove-antiaircraft').click();
  await expect(page.getByTestId('rom-import-status')).toContainText('could not be removed');
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Saved on this device');
  expect((await storedArchive(page, 'read')).bytes).toEqual([...replacement]);
  await page.evaluate(() => { IDBObjectStore.prototype.delete = (window as any).__originalRomDelete; });
  await storedArchive(page, 'corrupt');
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Needs re-import');
  await expect(page.getByTestId('export-antiaircraft')).toHaveCount(0);
  await expect(page.getByTestId('storage-status')).toContainText('invalid');
  await page.getByTestId('back').click();
  await page.getByTestId('open-library').click();
  await page.getByTestId('game-antiaircraft').click();
  await expect(page.getByTestId('game-rom-status')).toHaveText('Saved ROM needs re-import');
  await expect(page.getByTestId('play-selected')).toBeDisabled();
  await page.getByRole('button', { name: 'Local ROMs', exact: true }).click();
  await page.getByTestId('remove-antiaircraft').click();
  await expect(page.getByTestId('rom-item-antiaircraft')).toHaveCount(0);
  expect(await storedArchive(page, 'read')).toBeNull();
  await importZip(page, 'antiaircraft', 'recovered.zip', original, true);
  await storedArchive(page, 'clear');
  await page.getByTestId('back').click();
  await page.getByRole('button', { name: 'Local ROMs', exact: true }).click();
  await expect(page.getByTestId('rom-item-antiaircraft')).toHaveCount(0);
  await importZip(page, 'antiaircraft', 'again.zip', replacement, true);
  await page.getByTestId('remove-antiaircraft').click();
  await expect(page.getByTestId('rom-import-status')).toHaveText('Local ROM set removed.');
  await expect(page.getByTestId('rom-item-antiaircraft')).toHaveCount(0);
  expect(await storedArchive(page, 'read')).toBeNull();
  await expect(page.getByTestId('rom-game')).toBeFocused();
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('rom-item-antiaircraft')).toHaveCount(0);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Synthetic storage denial', 'SecurityError'); } });
  });
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('storage-status')).toContainText('unavailable');
  await importZip(page, 'antiaircraft', 'denied-session.zip', syntheticGameZip('antiaircraft'), true);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Available this session');
  await expect(page.getByTestId('storage-status')).toContainText('could not be saved');
  await page.getByTestId('remove-antiaircraft').click();
  await expect(page.getByTestId('rom-item-antiaircraft')).toHaveCount(0);
  await page.getByTestId('back').click();
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
});

test('storage denial, quota failure and one bounded unresponsive store preserve session imports and Pong', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction;
    (window as any).__storageFault = { reads: 0, aborts: 0 };
    IDBDatabase.prototype.transaction = function (names: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      if (names !== 'archives' || mode !== 'readonly') return original.call(this, names, mode, options);
      // An opened database whose reads never complete: exercise the transaction
      // watchdog, rather than an easier open() rejection or fake ROM metadata.
      const tx: any = { objectStore: () => ({ get: () => { (window as any).__storageFault.reads += 1; return {}; } }),
        abort: () => { (window as any).__storageFault.aborts += 1; tx.onabort?.(); } };
      return tx as IDBTransaction;
    };
  });
  const began = Date.now();
  await page.goto('?debug');
  await titleSettings(page);
  await expect(page.getByTestId('storage-status')).not.toContainText('Checking local');
  await expect(page.getByTestId('storage-status')).toContainText('unavailable');
  const watchdogs = await page.evaluate(() => (window as any).__storageFault);
  expect(watchdogs.reads).toBeLessThanOrEqual(2);
  expect(watchdogs.aborts).toBeGreaterThanOrEqual(1);
  expect(Date.now() - began, 'One store failure must resolve once, not ten sequential timeouts').toBeLessThan(8500);
  await page.getByTestId('back').click();
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Synthetic quota', 'QuotaExceededError'); };
  });
  await importZip(page, 'antiaircraft', 'quota-session.zip', syntheticGameZip('antiaircraft'), true);
  await expect(page.getByTestId('rom-item-antiaircraft')).toContainText('Available this session');
  await expect(page.getByTestId('storage-status')).toContainText('could not be saved');
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  const running = await snapshot(page);
  await waitSimulation(page, BigInt(running.timeps) + 200_000_000_000n);
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('rom-item-antiaircraft')).toHaveCount(0);
});

test('fullscreen success, unsupported and rejected requests preserve ordinary game menus and controls', async ({ page }, testInfo) => {
  await page.goto('?debug');
  await titleSettings(page);
  const supported = await page.evaluate(() => typeof document.querySelector('.game-shell')?.requestFullscreen === 'function' && document.fullscreenEnabled !== false);
  if (supported) {
    await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.game-shell')!;
      const native = shell.requestFullscreen.bind(shell);
      const observation = (window as any).__fullscreenAttempt = { attempts: 0, resolved: false, rejected: false };
      shell.requestFullscreen = async (options) => {
        observation.attempts += 1;
        try { await native(options); observation.resolved = true; }
        catch (error) { observation.rejected = true; throw error; }
      };
    });
    await page.getByTestId('fullscreen').click();
    await expect.poll(() => page.evaluate(() => {
      const value = (window as any).__fullscreenAttempt;
      return value.resolved || value.rejected;
    })).toBe(true);
    const observed = await page.evaluate(() => (window as any).__fullscreenAttempt);
    expect(observed.attempts).toBe(1);
    const active = await page.evaluate(() => !!document.fullscreenElement);
    if (observed.resolved) {
      expect(active, 'A resolved native fullscreen request must actually enter fullscreen').toBe(true);
      await expect(page.getByTestId('fullscreen-status')).toHaveText('Fullscreen active.');
      await expectViewportShell(page);
      await page.getByTestId('fullscreen').click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    } else {
      expect(observed.rejected).toBe(true);
      expect(active).toBe(false);
      await expect(page.getByTestId('fullscreen-status')).toContainText('could not start');
    }
  } else await expect(page.getByTestId('fullscreen')).toBeDisabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    document.querySelector<HTMLElement>('.game-shell')!.requestFullscreen = async () => { throw new DOMException('Synthetic rejection', 'NotAllowedError'); };
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await page.getByTestId('fullscreen').click();
  await expect(page.getByTestId('fullscreen-status')).toContainText('could not start');
  await expectViewportShell(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await expect(page.getByTestId('fullscreen')).toBeDisabled();
  await expect(page.getByTestId('fullscreen-status')).toContainText('unavailable');
  await page.screenshot({ path: testInfo.outputPath('fullscreen-unavailable-fallback.png') });
  await page.getByTestId('back').click();
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  const before = await snapshot(page);
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).axes[0] - before.axes[0]).toBeGreaterThan(3000);
  await page.keyboard.up('s');
  await expectViewportShell(page);
});
