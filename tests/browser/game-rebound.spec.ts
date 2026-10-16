// SPDX-License-Identifier: GPL-3.0-or-later
// Rebound in a desktop browser: Play entry, original coin/Start switches,
// horizontal paddles by keyboard, mouse and gamepad, settings, help and sound.
// Circuit behavior is asserted in simulated time; the original/native/Wasm
// comparison (tools/compare-games.py) is the accuracy gate, not this spec.
import { test, expect } from '@playwright/test';
import { installAudioProbe } from './helpers';
import { installGamepads, padState, screen, titleSettings } from './app-helpers';
import { holdClock, launch, presented, rasterRuns, state, stepClock, stepUntil, untilCircuit } from './game-helpers';
import { rebound } from '../../web/src/games/rebound';

// Original raster row of both paddles; the net is x 273..274 (tools/reference/games/rebound.py).
const PADDLE_ROW = 418;
const leftPaddle = (runs: [number, number][]) => runs.filter(([a, b]) => b < 273 && b - a >= 30);
const rightPaddle = (runs: [number, number][]) => runs.filter(([a, b]) => a > 274 && b - a >= 30);

test('Rebound plays from Play with separate coin and Start, horizontal paddles by keyboard, mouse and gamepad, and circuit sound', { tag: '@game-rebound' }, async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await installGamepads(page, 2);
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-rebound')).toBeVisible();
  await page.getByTestId('game-rebound').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Rebound');
  await expect(page.getByTestId('play-detail-rom')).toHaveText('No ROM needed');
  await expect(page.getByTestId('play-preview')).toHaveText('Play');
  if (rebound.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  const cold = await launch(page, 'rebound');
  expect(cold.gameOptions).toEqual({ winningScore: 11, coinage: 1 });
  expect([cold.inputs.paddle1, cold.inputs.paddle2]).toEqual([0, 0]);
  expect(cold.inputs.directions).toEqual([0, 0]);
  expect(cold.nativeRunning).toBe(false);
  expect(cold.attractN).toBe(0);
  expect(cold.playerScores).toEqual([0, 0]);
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  await expect(page.getByTestId('start-game')).toBeVisible();
  await expect(page.getByTestId('start-game-2')).toBeHidden();

  // Coin and Start are separate original switches, observed on the held clock.
  await holdClock(page, true);
  await page.getByTestId('start-game').click();
  let s = await stepUntil(page, (value) => value.switches.startCompleted[0] === 1, 1_000_000);
  expect(s.switches.startCompleted[0]).toBe(1);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'Start without a credit does not start a game').toBe(false);
  await page.getByTestId('insert-coin').click();
  s = await stepUntil(page, (value) => value.switches.coinCompleted[0] === 1, 1_000_000);
  expect(s.switches.coinCompleted[0]).toBe(1);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'A coin alone does not start a game').toBe(false);
  await page.getByTestId('start-game').click();
  s = await stepUntil(page, (value) => value.nativeRunning, 1_000_000);
  expect(s.nativeRunning, 'Coin then Start begins play within one simulated second').toBe(true);
  expect(s.attractN).toBe(1);

  // Keyboard: held A/D move the left paddle at the shared full-range rate
  // (one full range in two simulated seconds); the right paddle is untouched.
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.down('KeyA');
  await stepClock(page, 500_000);
  s = await state(page);
  expect(Math.abs(s.inputs.paddle1 + 16384)).toBeLessThanOrEqual(2);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  await stepClock(page, 2_000_000);
  await page.keyboard.up('KeyD');
  s = await state(page);
  expect([s.inputs.paddle1, s.inputs.paddle2]).toEqual([32767, 0]);
  await stepClock(page, 50_000);
  s = await state(page); await presented(page, s);
  let runs = await rasterRuns(page, PADDLE_ROW);
  expect(leftPaddle(runs), `left paddle at its right end next to the net: ${JSON.stringify(runs)}`).toHaveLength(1);
  expect(leftPaddle(runs)[0][1]).toBeGreaterThan(250);
  await page.keyboard.down('ArrowLeft');
  await stepClock(page, 2_000_000);
  await page.keyboard.up('ArrowLeft');
  await stepClock(page, 50_000);
  s = await state(page);
  expect([s.inputs.paddle1, s.inputs.paddle2]).toEqual([32767, -32768]);
  await presented(page, s);
  runs = await rasterRuns(page, PADDLE_ROW);
  expect(rightPaddle(runs), `right paddle at its left end next to the net: ${JSON.stringify(runs)}`).toHaveLength(1);
  expect(rightPaddle(runs)[0][0]).toBeLessThan(300);
  await holdClock(page, false);

  // Mouse: the default mouse player is the left paddle, across its full range.
  const raster = (await page.getByTestId('game-canvas').boundingBox())!;
  const y = raster.y + raster.height / 2;
  await page.mouse.move(raster.x + raster.width / 2, y);
  await page.mouse.move(raster.x + 2, y);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(-32768);
  await expect.poll(async () => leftPaddle(await rasterRuns(page, PADDLE_ROW))[0]?.[0], { timeout: 30_000 }).toBeLessThan(10);
  await page.mouse.move(raster.x + raster.width - 2, y);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(32767);
  expect((await state(page)).inputs.paddle2, 'The mouse moves only its chosen player').toBe(-32768);

  // Gamepad 2's X axis sets the right paddle's absolute position.
  await padState(page, 1, { axis: [0, -1] });
  await expect.poll(async () => (await state(page)).inputs.paddle2).toBe(-32768);
  await padState(page, 1, { axis: [0, 1] });
  await expect.poll(async () => (await state(page)).inputs.paddle2).toBe(32767);
  await padState(page, 1, { axis: [0, 0] });

  // The circuit scores and generates its own sound; the browser schedules it.
  const scored = await untilCircuit(page, (value) => value.playerScores[0] + value.playerScores[1] >= 1, 6);
  expect(scored.playerScores[0] + scored.playerScores[1], 'A point is scored within six simulated seconds').toBeGreaterThanOrEqual(1);
  expect(scored.scores).toEqual(scored.playerScores);
  expect(scored.audio.generatedSamples).toBeGreaterThan(cold.audio.generatedSamples);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('rebound-play.png') });

  // How to play names the original controls and the current winning score.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Rebound: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('First to 11 wins');
  for (const [label, key] of [['Left paddle left', 'A'], ['Left paddle right', 'D'], ['Right paddle left', '←'], ['Right paddle right', '→'], ['Start game', '1']]) {
    await expect(help.locator('div', { has: page.locator('dt', { hasText: label }) }).locator('kbd')).toHaveText(key);
  }
  await expect(page.getByTestId('mouse-help')).toContainText('left or right');
  await expect(page.getByTestId('mouse-help')).toContainText('left paddle');
  await testInfo.attach('rebound-browser.json', { body: Buffer.from(JSON.stringify({ cold, scored }, null, 2)), contentType: 'application/json' });
});

test('Rebound winning score and coinage reach the original DIP switches and persist', { tag: '@game-rebound' }, async ({ page }) => {
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('rebound');
  await expect(page.getByTestId('winning-score')).toHaveValue('11');
  await expect(page.getByTestId('coinage')).toHaveValue('1');
  await expect(page.getByTestId('binding-p1Left')).toHaveText('A');
  await expect(page.getByTestId('mouse-slot')).toHaveValue('0');
  await page.getByTestId('winning-score').selectOption('15');
  await page.getByTestId('coinage').selectOption('2');
  await page.reload();
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('rebound');
  await expect(page.getByTestId('winning-score')).toHaveValue('15');
  await expect(page.getByTestId('coinage')).toHaveValue('2');
  const cold = await launch(page, 'rebound');
  // The worker only reports options the core accepted as the packed DIP (DSW1 bit 0, DSW2 bit 1).
  expect(cold.gameOptions).toEqual({ winningScore: 15, coinage: 2 });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('First to 15 wins');
  await expect(page.locator('#game-help-content')).toContainText('two credits');
  await page.getByTestId('back').click();
  // A coin and Start begin play with the alternate settings.
  await page.getByTestId('resume').click();
  await page.getByTestId('insert-coin').click();
  await page.getByTestId('start-game').click();
  const running = await untilCircuit(page, (value) => value.nativeRunning, 3);
  expect(running.nativeRunning).toBe(true);
  // Apply & reset with a changed setting restarts the circuit cold with it.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('winning-score').selectOption('11');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ winningScore: 11, coinage: 2 });
  const reset = await state(page);
  expect(reset.identity.resetId).toBeGreaterThan(cold.identity.resetId);
  expect(reset.nativeRunning).toBe(false);
});

test('Rebound appears as a playable game on phone-sized Play screens (layout only)', { tag: '@game-rebound' }, async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    const row = page.locator('.play-list').getByTestId('game-rebound');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height + 0.001, 'The Rebound row is at least 44px tall').toBeGreaterThanOrEqual(44);
    await row.focus();
    await expect(page.getByTestId('play-preview')).toHaveText('Play');
    await expect(page.getByTestId('play-preview')).toBeInViewport();
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, 'Play must not scroll sideways').toBeLessThanOrEqual(card.client + 1);
  }
});
