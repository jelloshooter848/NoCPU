// SPDX-License-Identifier: GPL-3.0-or-later
// Crossfire in a desktop browser: Play entry, the coin that starts the game (no
// Start switch), two Up/Down gun sticks and two held Fire buttons by keyboard and
// gamepads, the play-time setting, help and sound. Circuit behavior is asserted
// in simulated time on the held clock; the original/native/Wasm comparison
// (tools/compare-games.py) is the accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { installAudioProbe } from './helpers';
import { installGamepads, padState, screen, titleSettings } from './app-helpers';
import { holdClock, launch, presented, state, stepClock, stepUntil } from './game-helpers';
import { crossfire } from '../../web/src/games/crossfire';

// Original raster (tools/reference/games/crossfire.py): guns in columns 27..55
// (left) and 521..548 (right), between the score band (to row 108) and the
// bottom band (from row 408). At its upper clamp a gun's first row is 111;
// held Down takes it under the bottom band.
const GUN_COLUMN = [40, 534];
const TOP_ROW = 111;

/** Lit rows of one column of the presented raster inside the playfield. */
async function columnRows(page: Page, x: number): Promise<number[]> {
  return page.getByTestId('game-canvas').evaluate((element, x) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(x, 0, 1, canvas.height).data;
    const rows: number[] = [];
    for (let y = 109; y <= 407; y += 1) if (data[y * 4] >= 150) rows.push(y);
    return rows;
  }, x);
}
/** Lit pixels of one row between the guns (a bullet in flight on that row). */
async function bulletPixels(page: Page, row: number): Promise<number> {
  return page.getByTestId('game-canvas').evaluate((element, row) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(60, row, 457, 1).data;
    let lit = 0;
    for (let x = 0; x < 457; x += 1) lit += Number(data[x * 4] >= 150);
    return lit;
  }, row);
}
async function settle(page: Page): Promise<any> {
  const snapshot = await state(page);
  await presented(page, snapshot);
  return snapshot;
}
async function coin(page: Page): Promise<any> {
  const base = (await state(page)).switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  await stepUntil(page, (value) => value.switches.coinCompleted[0] === base + 1, 1_000_000);
  return stepUntil(page, (value) => value.nativeRunning, 1_000_000);
}

test('Crossfire plays from Play: the coin starts it, two gun sticks and Fire by keyboard and gamepads, and circuit sound', { tag: '@game-crossfire' }, async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await installGamepads(page, 2);
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-crossfire')).toBeVisible();
  await page.getByTestId('game-crossfire').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Crossfire');
  await expect(page.getByTestId('play-detail-rom')).toHaveText('No ROM needed');
  await expect(page.getByTestId('play-preview')).toHaveText('Play');
  if (crossfire.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  const cold = await launch(page, 'crossfire');
  expect(cold.gameOptions).toEqual({ playtimeOhms: 1180000 });
  expect(cold.nativeRunning).toBe(false);
  expect(cold.attractN).toBe(0);
  expect(cold.playerScores).toEqual([0, 0]);
  expect(cold.inputs.directions).toEqual([0, 0]);
  expect(cold.held).toEqual([false, false]);
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  // Coin starts the game: there is no Start switch.
  await expect(page.getByTestId('start-game')).toBeHidden();

  // Fire does not start a game in attract; one coin does, at once (held clock).
  await holdClock(page, true);
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.down('KeyD');
  await stepClock(page, 200_000);
  await page.keyboard.up('KeyD');
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'Fire alone does not start a game').toBe(false);
  let s = await coin(page);
  expect(s.nativeRunning, 'One coin starts the game within one simulated second').toBe(true);
  expect(s.attractN).toBe(1);
  expect(s.playerScores).toEqual([0, 0]);
  await stepClock(page, 100_000);
  s = await settle(page);
  expect(await columnRows(page, GUN_COLUMN[0])).toEqual([236, 237, 238, 239]);
  expect(await columnRows(page, GUN_COLUMN[1])).toEqual([236, 237, 238, 239]);

  // Keyboard: W holds the left stick Up to the gun's upper clamp; ArrowDown holds
  // the right stick Down until that gun is under the bottom border. Each moves
  // only its own gun.
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.down('KeyW');
  await stepClock(page, 100_000);
  expect((await state(page)).inputs.directions).toEqual([-1, 0]);
  await stepClock(page, 900_000);
  await page.keyboard.up('KeyW');
  await stepClock(page, 20_000);
  s = await settle(page);
  expect(s.inputs.directions).toEqual([0, 0]);
  expect((await columnRows(page, GUN_COLUMN[0]))[0], 'Left gun at its upper clamp').toBe(TOP_ROW);
  expect(await columnRows(page, GUN_COLUMN[1]), 'The right gun has not moved').toEqual([236, 237, 238, 239]);
  await page.keyboard.down('ArrowDown');
  await stepClock(page, 2_000_000);
  await page.keyboard.up('ArrowDown');
  await stepClock(page, 20_000);
  await settle(page);
  expect(await columnRows(page, GUN_COLUMN[1]), 'Right gun under the bottom border').toEqual([]);
  expect((await columnRows(page, GUN_COLUMN[0]))[0], 'The left gun has not moved').toBe(TOP_ROW);

  // Fire (D) held: one bullet crosses on the gun's row, and no second bullet
  // follows while the button stays down. A new press fires again.
  await page.keyboard.down('KeyD');
  await stepClock(page, 300_000);
  s = await settle(page);
  expect(s.held).toEqual([true, false]);
  expect(await bulletPixels(page, 112), 'A bullet flies on the left gun row').toBeGreaterThan(0);
  await stepClock(page, 1_500_000);
  await settle(page);
  expect(await bulletPixels(page, 112), 'Held Fire does not repeat').toBe(0);
  await page.keyboard.up('KeyD');
  await stepClock(page, 100_000);
  expect((await state(page)).held).toEqual([false, false]);
  await page.keyboard.down('KeyD');
  await stepClock(page, 300_000);
  await page.keyboard.up('KeyD');
  await settle(page);
  expect(await bulletPixels(page, 112), 'A new press fires again').toBeGreaterThan(0);
  await stepClock(page, 1_500_000);

  // Gamepads: controller 2's vertical axis holds the right stick Up (the gun
  // comes back into view) and its button 2 is the right gun's Fire.
  await padState(page, 1, { axis: [1, -1] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([0, -1]);
  await stepClock(page, 600_000);
  await padState(page, 1, { axis: [1, 0] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([0, 0]);
  await settle(page);
  const right = await columnRows(page, GUN_COLUMN[1]);
  expect(right.length, `Right gun visible again: ${JSON.stringify(right)}`).toBeGreaterThan(0);
  await padState(page, 1, { button: [1, true] });
  await expect.poll(async () => (await state(page)).held).toEqual([false, true]);
  await padState(page, 1, { button: [1, false] });
  await expect.poll(async () => (await state(page)).held).toEqual([false, false]);
  await padState(page, 0, { axis: [1, 1] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([1, 0]);
  await padState(page, 0, { axis: [1, 0] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([0, 0]);
  await holdClock(page, false);

  // The circuit generates its own sound; the browser schedules it.
  const playing = await state(page);
  expect(playing.audio.generatedSamples).toBeGreaterThan(cold.audio.generatedSamples);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('crossfire-play.png') });

  // How to play names both players' original controls; the mouse is not used.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Crossfire: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('Insert a coin: the game starts at once.');
  await expect(help).toContainText('holding Fire does not repeat');
  await expect(help).toContainText('lasts about 130 seconds');
  for (const [label, key] of [['Left gun up', 'W'], ['Left gun down', 'S'], ['Left gun fire', 'D'],
    ['Right gun up', '↑'], ['Right gun down', '↓'], ['Right gun fire', '←'], ['Insert coin', 'Enter']]) {
    await expect(help.locator('div', { has: page.locator('dt', { hasText: label }) }).locator('kbd')).toHaveText(key);
  }
  await expect(help.locator('dt', { hasText: 'Start game' })).toHaveCount(0);
  await testInfo.attach('crossfire-browser.json', { body: Buffer.from(JSON.stringify({ cold, playing }, null, 2)), contentType: 'application/json' });
});

test('Crossfire play time reaches the original potentiometer and ends the game on the timer; a coin restarts it', { tag: '@game-crossfire' }, async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('crossfire');
  await expect(page.getByTestId('playtime')).toHaveValue('50');
  await expect(page.getByTestId('binding-p1Fire')).toHaveText('D');
  await expect(page.locator('#mouse-setting')).toContainText('The mouse is not used for this game.');
  // 0% is the potentiometer's 680 kOhm end: a game of ln 3 x 680 kOhm x 100 uF = 74.7 s.
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await expect(page.getByTestId('playtime-value')).toHaveText('0%');
  await page.reload();
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('crossfire');
  await expect(page.getByTestId('playtime')).toHaveValue('0');
  const cold = await launch(page, 'crossfire');
  // The worker only reports options the core accepted.
  expect(cold.gameOptions).toEqual({ playtimeOhms: 680000 });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('lasts about 75 seconds');
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();

  await holdClock(page, true);
  const started = await coin(page);
  expect(started.nativeRunning).toBe(true);
  const start = BigInt(started.timePs);
  // Held clock: still in play at 74.0 s, over by 75.0 s after the coin.
  await stepClock(page, 74_000_000 - Number((BigInt((await state(page)).timePs) - start) / 1_000_000n));
  expect((await state(page)).nativeRunning, 'Still in play 74 simulated seconds after the coin').toBe(true);
  const ended = await stepUntil(page, (value) => !value.nativeRunning, 1_000_000, 50_000);
  expect(ended.nativeRunning, 'The timer ends the game by 75 simulated seconds').toBe(false);
  expect(ended.attractN).toBe(0);
  // Fire after the end does not start a game; a coin starts a new one with cleared scores.
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.down('ArrowLeft');
  await stepClock(page, 200_000);
  await page.keyboard.up('ArrowLeft');
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning).toBe(false);
  const again = await coin(page);
  expect(again.nativeRunning).toBe(true);
  expect(again.playerScores).toEqual([0, 0]);
  await holdClock(page, false);

  // Apply & reset with a changed setting restarts the circuit cold with it.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('playtime').focus(); await page.keyboard.press('End'); await page.getByTestId('playtime').dispatchEvent('change');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ playtimeOhms: 1680000 });
  const reset = await state(page);
  expect(reset.identity.resetId).toBeGreaterThan(cold.identity.resetId);
  expect(reset.nativeRunning).toBe(false);
});

test('Crossfire appears as a playable game on phone-sized Play screens (layout only)', { tag: '@game-crossfire' }, async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    const row = page.locator('.play-list').getByTestId('game-crossfire');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height + 0.001, 'The Crossfire row is at least 44px tall').toBeGreaterThanOrEqual(44);
    await row.focus();
    await expect(page.getByTestId('play-preview')).toHaveText('Play');
    await expect(page.getByTestId('play-preview')).toBeInViewport();
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, 'Play must not scroll sideways').toBeLessThanOrEqual(card.client + 1);
  }
});
