// SPDX-License-Identifier: GPL-3.0-or-later
// Browser platform fixtures never alter the circuit or its read-only snapshots.
import { expect, type Page } from '@playwright/test';

export async function titleSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'settings');
}
export async function screen(page: Page, value: string): Promise<void> {
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', value);
}
export async function importZip(page: Page, gameId: string, name: string, buffer: Buffer, remember = false): Promise<void> {
  await page.getByTestId('rom-game').selectOption(gameId);
  await page.getByTestId('remember-roms').setChecked(remember);
  await page.getByTestId('rom-import').setInputFiles({ name, mimeType: 'application/zip', buffer });
  await expect(page.getByTestId('rom-import')).toBeEnabled();
  await expect(page.getByTestId('rom-import-status')).not.toHaveText('Checking ROM ZIP…');
}
export async function installGamepads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as any;
    target.__testPads = [0, 1].map((index) => ({ index, id: `Synthetic platform controller ${index + 1}`, connected: true,
      mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 32 }, () => ({ pressed: false, touched: false, value: 0 })) }));
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => target.__testPads });
  });
}
export async function padState(page: Page, pad: number, patch: { axis?: [number, number]; button?: [number, boolean]; connected?: boolean }): Promise<void> {
  await page.evaluate(({ pad, patch }) => {
    const value = (window as any).__testPads[pad];
    if (patch.axis) value.axes[patch.axis[0]] = patch.axis[1];
    if (patch.button) value.buttons[patch.button[0]] = { pressed: patch.button[1], touched: patch.button[1], value: Number(patch.button[1]) };
    if (patch.connected !== undefined) value.connected = patch.connected;
    value.timestamp += 1;
  }, { pad, patch });
  // The UI polls the real platform API on animation frames. Wait for two polls,
  // then assert an observable result rather than relying on this wait alone.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
export async function padPresent(page: Page, pad: number, present: boolean): Promise<void> {
  await page.evaluate(({ pad, present }) => {
    const target = window as any;
    target.__savedPads ??= {};
    if (present) target.__testPads[pad] = target.__savedPads[pad];
    else { target.__savedPads[pad] = target.__testPads[pad]; target.__testPads[pad] = null; }
  }, { pad, present });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
export async function storedArchive(page: Page, operation: 'read' | 'clear' | 'corrupt'): Promise<any> {
  return page.evaluate(async (operation) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('nocpu-local-roms', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('archives', operation === 'read' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('archives');
        const request = operation === 'read' ? store.get('antiaircraft') : operation === 'clear' ? store.clear()
          : store.put({ version: 1, gameId: 'antiaircraft', fileName: 'stale.zip', bytes: new Uint8Array([1, 2, 3]).buffer });
        tx.oncomplete = () => resolve(operation === 'read' && request.result ? {
          fileName: request.result.fileName, bytes: Array.from(new Uint8Array(request.result.bytes)) } : null);
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, operation);
}
