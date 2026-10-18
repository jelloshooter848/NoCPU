// SPDX-License-Identifier: GPL-3.0-or-later
// Hi-Way in a desktop browser: Play entry, the coin that starts the game (no
// Start switch), the original quadrature steering wheel by keyboard keys,
// gamepad axis and mouse position, the held accelerator, the DIP and
// play-time settings, help, and the inherited absent sound. Circuit behavior
// is asserted in simulated time; the original/native/Wasm comparison
// (tools/compare-games.py) is the accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { installGamepads, padState, screen, titleSettings } from './app-helpers';
import { holdClock, launch, presented, state, stepUntil, untilCircuit } from './game-helpers';
import { hiway } from '../../web/src/games/hiway';

/** Advance the held clock in quarter-second slices (each debug step must answer within 5 s). */
async function stepClock(page: Page, microseconds: number): Promise<void> {
  for (let remaining = microseconds; remaining > 0; remaining -= 250_000) {
    await page.evaluate((step) => (window as any).__nocpuDebug.stepClock(step), Math.min(250_000, remaining));
  }
}
// The player's car is the white sprite on rows 318..332 of the original raster
// (tools/reference/games/hiway.py); its horizontal centre, or null.
async function carX(page: Page): Promise<number | null> {
  await presented(page, await state(page));
  return page.getByTestId('game-canvas').evaluate((element) => {
    const data = (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 318, 576, 15).data;
    const columns: number[] = [];
    for (let x = 40; x < 576; x += 1) for (let y = 0; y < 15; y += 1) if (data[(y * 576 + x) * 4] > 220) { columns.push(x); break; }
    if (!columns.length || columns[columns.length - 1] - columns[0] > 40) return null;
    return (columns[0] + columns[columns.length - 1]) / 2;
  });
}
// At 10 kOhm the original ends the game 51.4 simulated seconds after the coin
// (tools/reference/games/hiway.py): in play at 50 s, over by 53 s.
const TIME_OVER_EARLIEST_US = 50_000_000;
const TIME_OVER_WINDOW_US = 3_000_000;
async function coin(page: Page): Promise<any> {
  const base = (await state(page)).switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  return stepUntil(page, (value) => value.switches.coinCompleted[0] === base + 1, 1_000_000);
}
/** Hold a steering input for 0.3 simulated seconds, then let the car run on
 * its new heading; returns the car's horizontal travel over the next second. */
async function steer(page: Page, hold: () => Promise<void>, release: () => Promise<void>): Promise<number> {
  await hold();
  await stepClock(page, 300_000);
  await release();
  await stepClock(page, 250_000);
  const from = await carX(page);
  await stepClock(page, 1_000_000);
  const to = await carX(page);
  expect(from !== null && to !== null, 'The car is visible on its row').toBe(true);
  return to! - from!;
}

test('Hi-Way plays from Play: the coin starts it, the wheel steers by keys, gamepad and mouse, and the accelerator is held', { tag: '@game-hiway' }, async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await installGamepads(page, 1);
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-hiway')).toBeVisible();
  await page.getByTestId('game-hiway').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Hi-Way');
  await expect(page.getByTestId('play-detail-rom')).toHaveText('No ROM needed');
  if (hiway.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  const cold = await launch(page, 'hiway');
  expect(cold.gameOptions).toEqual({ extendedPlay: 60, concurrentTraffic: 1, opposingTraffic: 1, playtimeOhms: 510000 });
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  expect(cold.nativeRunning).toBe(false);
  await expect(page.getByTestId('start-game')).toBeHidden();

  // The coin alone starts the game, with a cleared score and play-time counter.
  await holdClock(page, true);
  let s = await coin(page);
  s = await stepUntil(page, (value) => value.nativeRunning, 200_000);
  expect(s.nativeRunning, 'The coin starts the game').toBe(true);
  await stepClock(page, 100_000);
  expect((await state(page)).playerScores).toEqual([0, 0]);

  // Accelerator: Up/W held is the original held switch.
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.down('ArrowUp');
  await stepClock(page, 100_000);
  expect((await state(page)).held).toEqual([true]);
  await stepClock(page, 1_500_000);
  // Keys turn the wheel through DICE's keyboard path: left steers left, right steers right.
  const left = await steer(page, () => page.keyboard.down('ArrowLeft'), () => page.keyboard.up('ArrowLeft'));
  const right = await steer(page, () => page.keyboard.down('KeyD'), () => page.keyboard.up('KeyD'));
  expect(left, `Left key: travel ${left}`).toBeLessThan(0);
  expect(right, `Right key: travel ${right}`).toBeGreaterThan(0);
  // The gamepad's horizontal axis sets the turning rate (the core applies the original 20% deadzone).
  const padLeft = await steer(page, () => padState(page, 0, { axis: [0, -1] }), () => padState(page, 0, { axis: [0, 0] }));
  expect(padLeft, `Gamepad left: travel ${padLeft}`).toBeLessThan(0);
  expect((await state(page)).inputs.paddle1, 'A centred stick returns the wheel axis to straight').toBe(0);
  const padRight = await steer(page, () => padState(page, 0, { axis: [0, 1] }), () => padState(page, 0, { axis: [0, 0] }));
  expect(padRight, `Gamepad right: travel ${padRight}`).toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp');
  await stepClock(page, 100_000);
  expect((await state(page)).held).toEqual([false]);
  // Gamepad A holds the accelerator.
  await padState(page, 0, { button: [0, true] });
  await expect.poll(async () => (await state(page)).held).toEqual([true]);
  await padState(page, 0, { button: [0, false] });
  await expect.poll(async () => (await state(page)).held).toEqual([false]);

  // Mouse: the horizontal position sets the turning rate; the left button accelerates.
  const box = (await page.getByTestId('game-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(-32768);
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(32767);
  await page.mouse.down();
  await expect.poll(async () => (await state(page)).held).toEqual([true]);
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).held).toEqual([false]);
  await page.mouse.move(box.x + box.width / 2, box.y - 20);
  await expect.poll(async () => (await state(page)).inputs.paddle1, 'Leaving the display straightens the wheel').toBe(0);
  // Held wheel keys take the wheel over from the mouse: releasing them leaves
  // the wheel straight rather than handing back the mouse's last turning rate.
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(-32768);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page)).inputs.paddle1, 'The keys take the wheel over').toBe(0);
  await stepClock(page, 100_000);
  await page.keyboard.up('ArrowRight');
  await stepClock(page, 100_000);
  expect((await state(page)).inputs.paddle1, 'Released keys leave the wheel straight').toBe(0);
  // A click without mouse movement (for example to focus the game) sets no
  // turning rate; its left button still holds the accelerator.
  await page.mouse.down();
  await expect.poll(async () => (await state(page)).held).toEqual([true]);
  expect((await state(page)).inputs.paddle1, 'A click alone does not turn the wheel').toBe(0);
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).held).toEqual([false]);
  expect((await state(page)).inputs.paddle1).toBe(0);
  // Leaving the display clears only the mouse's turning rate, not a held stick's.
  await padState(page, 0, { axis: [0, -1] });
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(-32768);
  await page.mouse.move(box.x + box.width / 2, box.y - 20);
  await stepClock(page, 100_000);
  expect((await state(page)).inputs.paddle1, 'A held stick keeps turning after the pointer leaves').toBe(-32768);
  await padState(page, 0, { axis: [0, 0] });
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(0);

  // Real-time speed is measured and reported, never gated (docs/TESTING.md).
  const wallNow = () => page.evaluate(() => performance.now());
  const wall = await wallNow();
  await stepClock(page, 2_000_000);
  const rawSpeedRatio = 2 / ((await wallNow() - wall) / 1000);
  await holdClock(page, false);
  const paced = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  await expect.poll(async () => BigInt((await state(page)).timePs) >= BigInt(paced.state.timePs) + 3_000_000_000_000n, { timeout: 120_000 }).toBe(true);
  const pacedEnd = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  const simulationSeconds = Number(BigInt(pacedEnd.state.timePs) - BigInt(paced.state.timePs)) / 1e12;
  const performanceMetrics = { rawSpeedRatio, simulationSeconds, wallSeconds: (pacedEnd.wall - paced.wall) / 1000,
    simulationSpeedRatio: simulationSeconds / ((pacedEnd.wall - paced.wall) / 1000), browser: page.context().browser()?.version(),
    evidenceScope: 'Hi-Way in play in a headless desktop browser on this host; reported, not gated, and not a performance qualification.' };
  await testInfo.attach('hiway-performance.json', { body: Buffer.from(JSON.stringify(performanceMetrics, null, 2)), contentType: 'application/json' });
  testInfo.annotations.push({ type: 'performance', description: `simulationSpeedRatio=${performanceMetrics.simulationSpeedRatio.toFixed(3)} rawSpeedRatio=${rawSpeedRatio.toFixed(3)}` });
  expect((await state(page)).audio.generatedSamples, 'Inherited absent audio').toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('hiway-play.png') });

  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Hi-Way: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('there is no Start button');
  await expect(help).toContainText('reaching 60 points earns extended play');
  for (const [label, keys] of [['Steer left', ['←', 'A']], ['Steer right', ['→', 'D']], ['Accelerator', ['↑', 'W']], ['Insert coin and start', ['Enter']]] as const) {
    await expect(help.locator('dl.controls-help > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText([...keys]);
  }
  await expect(page.getByTestId('mouse-help')).toContainText('hold the left mouse button');
  await testInfo.attach('hiway-browser.json', { body: Buffer.from(JSON.stringify({ cold, performanceMetrics }, null, 2)), contentType: 'application/json' });
});

test('Hi-Way settings reach the original switches and potentiometer, and the timer ends the game', { tag: '@game-hiway' }, async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('hiway');
  await expect(page.getByTestId('extended-play')).toHaveValue('60');
  await expect(page.getByTestId('playtime')).toHaveValue('50');
  await expect(page.getByTestId('binding-p1Gas')).toContainText('↑');
  await expect(page.getByTestId('mouse-slot')).toHaveValue('0');
  await page.getByTestId('extended-play').selectOption('0');
  await page.getByTestId('concurrent-traffic').selectOption('2');
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await expect(page.getByTestId('playtime-value')).toHaveText('0%');
  await page.reload();
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('hiway');
  await expect(page.getByTestId('extended-play')).toHaveValue('0');
  const cold = await launch(page, 'hiway');
  // The worker only reports options the core accepted.
  expect(cold.gameOptions).toEqual({ extendedPlay: 0, concurrentTraffic: 2, opposingTraffic: 1, playtimeOhms: 10000 });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).not.toContainText('extended play');
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();

  // At 10 kOhm the play-time counter ends the game about 51 simulated seconds after the coin.
  await holdClock(page, true);
  await coin(page);
  const started = await stepUntil(page, (value) => value.nativeRunning, 200_000);
  expect(started.nativeRunning).toBe(true);
  const begin = BigInt(started.timePs);
  await stepClock(page, TIME_OVER_EARLIEST_US - Number((BigInt((await state(page)).timePs) - begin) / 1_000_000n));
  expect((await state(page)).nativeRunning, 'Still in play shortly before the timer runs out').toBe(true);
  const ended = await stepUntil(page, (value) => !value.nativeRunning, TIME_OVER_WINDOW_US, 100_000);
  expect(ended.nativeRunning, 'The timer ends the game').toBe(false);
  // A coin starts a new game.
  await coin(page);
  expect((await stepUntil(page, (value) => value.nativeRunning, 200_000)).nativeRunning).toBe(true);
  await holdClock(page, false);

  // Apply & reset with a changed setting restarts the circuit cold with it.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('opposing-traffic').selectOption('2');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ extendedPlay: 0, concurrentTraffic: 2, opposingTraffic: 2, playtimeOhms: 10000 });
  const reset = await state(page);
  expect(reset.identity.resetId).toBeGreaterThan(cold.identity.resetId);
  // The cold circuit settles out of play within its first simulated millisecond.
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  const settled = await untilCircuit(page, (value) => BigInt(value.timePs) >= 500_000_000_000n, 1);
  expect(settled.identity.resetId).toBe(reset.identity.resetId);
  expect(settled.nativeRunning).toBe(false);
});

test('Hi-Way appears as a playable game on phone-sized Play screens (layout only)', { tag: '@game-hiway' }, async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    const row = page.locator('.play-list').getByTestId('game-hiway');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height + 0.001, 'The Hi-Way row is at least 44px tall').toBeGreaterThanOrEqual(44);
    await row.focus();
    await expect(page.getByTestId('play-preview')).toHaveText('Play');
    await expect(page.getByTestId('play-preview')).toBeInViewport();
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, 'Play must not scroll sideways').toBeLessThanOrEqual(card.client + 1);
  }
});
