// SPDX-License-Identifier: GPL-3.0-or-later
// Quadrapong in a desktop browser: Play entry, original coin/Start switches and
// credits, four paddles (left/right vertical, top/bottom horizontal) by keyboard,
// mouse and gamepads, the coinage setting, help and sound. Circuit behavior is
// asserted in simulated time; the original/native/Wasm comparison
// (tools/compare-games.py) is the accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { installAudioProbe } from './helpers';
import { installGamepads, padState, screen, titleSettings } from './app-helpers';
import { holdClock, launch, presented, rasterRuns, state, stepClock, stepUntil, untilCircuit } from './game-helpers';
import { quadrapong } from '../../web/src/games/quadrapong';

// Original raster lanes (tools/reference/games/quadrapong.py): left paddle
// columns 129..134, right 449..454; top paddle rows 56..62, bottom 386..392.
const paddles = (s: any) => [s.inputs.paddle1, s.inputs.paddle2, s.inputs.paddle3, s.inputs.paddle4];
const has = (runs: [number, number][], first: number, last: number) => runs.some(([a, b]) => a <= first && b >= last);
// Miss counters: one credit loads a two-player game, two credits a four-player game.
const TWO_PLAYERS = [0, 0, 4, 4];
const FOUR_PLAYERS = [4, 4, 0, 0];

async function coinAndStart(page: Page, coins: number): Promise<any> {
  const base = (await state(page)).switches.coinCompleted[0];
  for (let coin = 0; coin < coins; coin += 1) {
    await page.getByTestId('insert-coin').click();
    await stepUntil(page, (value) => value.switches.coinCompleted[0] === base + coin + 1, 1_000_000);
    await stepClock(page, 100_000);
  }
  await page.getByTestId('start-game').click();
  return stepUntil(page, (value) => value.nativeRunning, 1_000_000);
}

test('Quadrapong plays from Play with coin credits and Start, four paddles by keyboard, mouse and gamepads, and circuit sound', { tag: '@game-quadrapong' }, async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await installGamepads(page, 4);
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-quadrapong')).toBeVisible();
  await page.getByTestId('game-quadrapong').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Quadrapong');
  await expect(page.getByTestId('play-detail-rom')).toHaveText('No ROM needed');
  await expect(page.getByTestId('play-preview')).toHaveText('Play');
  if (quadrapong.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  const cold = await launch(page, 'quadrapong');
  expect(cold.gameOptions).toEqual({ coinage: 1 });
  expect(paddles(cold)).toEqual([0, 0, 0, 0]);
  expect(cold.nativeRunning).toBe(false);
  expect(cold.attractN).toBe(0);
  expect(cold.playerScores).toHaveLength(4);
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  await expect(page.getByTestId('start-game')).toBeVisible();
  await expect(page.getByTestId('start-game-2')).toBeHidden();

  // Coin and Start are separate original switches, observed on the held clock;
  // two coins buy a four-player game.
  await holdClock(page, true);
  await page.getByTestId('start-game').click();
  let s = await stepUntil(page, (value) => value.switches.startCompleted[0] === 1, 1_000_000);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'Start without a credit does not start a game').toBe(false);
  await page.getByTestId('insert-coin').click();
  s = await stepUntil(page, (value) => value.switches.coinCompleted[0] === 1, 1_000_000);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'A coin alone does not start a game').toBe(false);
  s = await coinAndStart(page, 1);
  expect(s.nativeRunning, 'Two coins then Start begin play within one simulated second').toBe(true);
  expect(s.attractN).toBe(1);
  await stepClock(page, 50_000);
  expect((await state(page)).playerScores, 'Two credits load a four-player game').toEqual(FOUR_PLAYERS);

  // Keyboard: each pair moves only its own paddle at the shared full-range rate
  // (one full range in two simulated seconds).
  await page.getByTestId('game-canvas').focus();
  for (const [key, slot, value] of [['KeyS', 0, 16384], ['ArrowUp', 1, -16384], ['KeyJ', 2, -16384], ['KeyB', 3, 16384]] as const) {
    await page.keyboard.down(key);
    await stepClock(page, 500_000);
    await page.keyboard.up(key);
    s = await state(page);
    expect(Math.abs(paddles(s)[slot] - value), `${key} moves paddle ${slot + 1}`).toBeLessThanOrEqual(2);
    for (let other = slot + 1; other < 4; other += 1) expect(paddles(s)[other], `${key} leaves paddle ${other + 1}`).toBe(0);
  }
  // All four held together reach their ends: left down, right up, top left,
  // bottom right, each on its own lane of the original raster.
  for (const key of ['KeyS', 'ArrowUp', 'KeyJ', 'KeyB']) await page.keyboard.down(key);
  await stepClock(page, 800_000);
  for (const key of ['KeyS', 'ArrowUp', 'KeyJ', 'KeyB']) await page.keyboard.up(key);
  await stepClock(page, 50_000);
  s = await state(page);
  expect(paddles(s)).toEqual([32767, -32768, -32768, 32767]);
  await presented(page, s);
  const bottomRow = await rasterRuns(page, 389), topRow = await rasterRuns(page, 59);
  expect(has(bottomRow, 129, 134), `left paddle at its low end: ${JSON.stringify(bottomRow)}`).toBe(true);
  expect(has(topRow, 449, 454), `right paddle at its top end: ${JSON.stringify(topRow)}`).toBe(true);
  expect(has(topRow, 123, 144), `top paddle at its left end: ${JSON.stringify(topRow)}`).toBe(true);
  expect(has(bottomRow, 436, 458), `bottom paddle at its right end: ${JSON.stringify(bottomRow)}`).toBe(true);
  await holdClock(page, false);

  // Mouse: the default mouse player is the left paddle, vertically across its range.
  const raster = (await page.getByTestId('game-canvas').boundingBox())!;
  const x = raster.x + raster.width / 2;
  await page.mouse.move(x, raster.y + raster.height / 2);
  await page.mouse.move(x, raster.y + 2);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(-32768);
  await page.mouse.move(x, raster.y + raster.height - 2);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(32767);
  expect(paddles(await state(page)).slice(1), 'The mouse moves only its chosen player').toEqual([-32768, -32768, 32767]);

  // Gamepads 2..4: vertical axis for the right paddle, horizontal for top and bottom.
  await padState(page, 1, { axis: [1, 1] });
  await expect.poll(async () => (await state(page)).inputs.paddle2).toBe(32767);
  await padState(page, 2, { axis: [0, 1] });
  await expect.poll(async () => (await state(page)).inputs.paddle3).toBe(32767);
  await padState(page, 3, { axis: [0, -1] });
  await expect.poll(async () => (await state(page)).inputs.paddle4).toBe(-32768);
  for (const [pad, axis] of [[1, 1], [2, 0], [3, 0]] as const) await padState(page, pad, { axis: [axis, 0] });

  // The circuit generates its own sound; the browser schedules it.
  const playing = await state(page);
  expect(playing.audio.generatedSamples).toBeGreaterThan(cold.audio.generatedSamples);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('quadrapong-play.png') });

  // How to play names the four players' original controls.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Quadrapong: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('two coins for a four-player game');
  for (const [label, key] of [['Left paddle up', 'W'], ['Left paddle down', 'S'], ['Right paddle up', '↑'], ['Right paddle down', '↓'],
    ['Top paddle left', 'J'], ['Top paddle right', 'L'], ['Bottom paddle left', 'V'], ['Bottom paddle right', 'B'], ['Start game', '1']]) {
    await expect(help.locator('div', { has: page.locator('dt', { hasText: label }) }).locator('kbd')).toHaveText(key);
  }
  await expect(page.getByTestId('mouse-help')).toContainText('up or down');
  await expect(page.getByTestId('mouse-help')).toContainText('left paddle');
  await testInfo.attach('quadrapong-browser.json', { body: Buffer.from(JSON.stringify({ cold, playing }, null, 2)), contentType: 'application/json' });
});

test('Quadrapong one credit is a two-player game; the coinage setting reaches the original DIP switch and persists', { tag: '@game-quadrapong' }, async ({ page }) => {
  // Default coinage: one coin and Start load a two-player game (top and bottom out).
  await launch(page, 'quadrapong');
  await holdClock(page, true);
  let s = await coinAndStart(page, 1);
  expect(s.nativeRunning).toBe(true);
  await stepClock(page, 50_000);
  expect((await state(page)).playerScores).toEqual(TWO_PLAYERS);
  // With no paddle moved the serve is missed: the circuit counts it against the
  // left or right player. Held clock: exact.
  const missed = await stepUntil(page, (value) => value.playerScores[0] + value.playerScores[1] > 0, 5_000_000, 50_000);
  expect(missed.playerScores[0] + missed.playerScores[1], 'One miss is counted within five simulated seconds').toBe(1);
  expect(missed.playerScores.slice(2)).toEqual([4, 4]);
  await holdClock(page, false);

  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('quadrapong');
  await expect(page.getByTestId('coinage')).toHaveValue('1');
  await expect(page.getByTestId('binding-p3Left')).toHaveText('J');
  await expect(page.getByTestId('mouse-slot')).toHaveValue('0');
  await page.getByTestId('coinage').selectOption('2');
  await page.reload();
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('quadrapong');
  await expect(page.getByTestId('coinage')).toHaveValue('2');
  const cold = await launch(page, 'quadrapong');
  // The worker only reports options the core accepted as the packed DIP (DSW1 bit 0).
  expect(cold.gameOptions).toEqual({ coinage: 2 });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('one coin buys a four-player game');
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  // One coin now buys a four-player game.
  await holdClock(page, true);
  s = await coinAndStart(page, 1);
  expect(s.nativeRunning).toBe(true);
  await stepClock(page, 50_000);
  expect((await state(page)).playerScores).toEqual(FOUR_PLAYERS);
  await holdClock(page, false);
  // Apply & reset with a changed setting restarts the circuit cold with it.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('coinage').selectOption('1');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ coinage: 1 });
  const reset = await state(page);
  expect(reset.identity.resetId).toBeGreaterThan(cold.identity.resetId);
  // The cold circuit settles into attract within its first simulated millisecond.
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  const settled = await untilCircuit(page, (value) => BigInt(value.timePs) >= 500_000_000_000n, 1);
  expect(settled.identity.resetId).toBe(reset.identity.resetId);
  expect(settled.nativeRunning).toBe(false);
});

test('Quadrapong appears as a playable game on phone-sized Play screens (layout only)', { tag: '@game-quadrapong' }, async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    const row = page.locator('.play-list').getByTestId('game-quadrapong');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height + 0.001, 'The Quadrapong row is at least 44px tall').toBeGreaterThanOrEqual(44);
    await row.focus();
    await expect(page.getByTestId('play-preview')).toHaveText('Play');
    await expect(page.getByTestId('play-preview')).toBeInViewport();
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, 'Play must not scroll sideways').toBeLessThanOrEqual(card.client + 1);
  }
});
