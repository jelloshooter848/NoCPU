// SPDX-License-Identifier: GPL-3.0-or-later
// Pin Pong in a desktop browser: Play entry, the rotated portrait raster, the
// original coin/Start switches (Start also serves), both flippers by keyboard,
// mouse buttons and gamepad, the DIP settings, help, and the sound and
// free-game select NoCPU reconstructs from Atari's schematic. Circuit behavior is asserted in simulated time; the
// original/native/Wasm comparison (tools/compare-games.py) is the accuracy
// gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { installGamepads, padState, screen, titleSettings } from './app-helpers';
import { holdClock, launch, presented, state, stepUntil } from './game-helpers';
import { pinpong } from '../../web/src/games/pinpong';

/** Advance the held clock in 100 ms slices: Pin Pong steps below real time in
 * some engines, and each debug step must answer within 5 s. */
async function stepClock(page: Page, microseconds: number): Promise<void> {
  for (let remaining = microseconds; remaining > 0; remaining -= 100_000) {
    await page.evaluate((step) => (window as any).__nocpuDebug.stepClock(step), Math.min(100_000, remaining));
  }
}
// A raised flipper is a dark row 324 across its side of the original raster
// (tools/reference/games/pinpong.py).
async function flippers(page: Page): Promise<{ left: boolean; right: boolean }> {
  await stepClock(page, 50_000);
  await presented(page, await state(page));
  return page.getByTestId('game-canvas').evaluate((element) => {
    const data = (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 324, 324, 1).data;
    const dark = (from: number, to: number) => { let count = 0; for (let x = from; x <= to; x += 1) count += Number(data[x * 4] < 80); return count; };
    return { left: dark(65, 124) >= 40, right: dark(170, 239) >= 40 };
  });
}
async function coin(page: Page): Promise<void> {
  const base = (await state(page)).switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  await stepUntil(page, (value) => value.switches.coinCompleted[0] === base + 1, 1_000_000);
  await stepClock(page, 200_000);
}
async function start(page: Page): Promise<any> {
  const base = (await state(page)).switches.startCompleted[0];
  await page.getByTestId('start-game').click();
  return stepUntil(page, (value) => value.switches.startCompleted[0] === base + 1, 1_000_000);
}

test('Pin Pong plays from Play on its rotated raster: credits, Start serves, both flippers by keyboard, mouse and gamepad', { tag: '@game-pinpong' }, async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await installGamepads(page, 1);
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-pinpong')).toBeVisible();
  await page.getByTestId('game-pinpong').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Pin Pong');
  await expect(page.getByTestId('play-detail-rom')).toHaveText('No ROM needed');
  if (pinpong.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  const cold = await launch(page, 'pinpong');
  expect(cold.gameOptions).toEqual({ coinage: 1, freeBall: 1, balls: 3, freeGame: 0, toneOhms: 1500 });
  expect(cold.display, 'The original monitor is rotated: a portrait raster').toEqual({ width: 324, height: 432, pixelFormat: 'rgba8888' });
  const box = (await page.getByTestId('game-canvas').boundingBox())!;
  expect(box.height, 'The canvas keeps the portrait aspect').toBeGreaterThan(box.width);
  expect(cold.nativeRunning).toBe(false);
  await expect(page.getByTestId('start-game')).toBeVisible();

  await holdClock(page, true);
  await start(page);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'Start without a credit does not start a game').toBe(false);
  await coin(page);
  expect((await state(page)).nativeRunning, 'A coin alone does not start a game').toBe(false);
  await start(page);
  let s = await stepUntil(page, (value) => value.nativeRunning, 300_000);
  expect(s.nativeRunning, 'Start with a credit begins the game').toBe(true);
  await stepClock(page, 100_000);
  expect((await state(page)).playerScores, 'A cleared score and the first ball served').toEqual([0, 1]);

  // Keyboard: Z / Left raise the left flipper, / and Right the right one, while held.
  await page.getByTestId('game-canvas').focus();
  expect(await flippers(page)).toEqual({ left: false, right: false });
  for (const [key, expected] of [['KeyZ', { left: true, right: false }], ['ArrowLeft', { left: true, right: false }],
    ['Slash', { left: false, right: true }], ['ArrowRight', { left: false, right: true }]] as const) {
    await page.keyboard.down(key);
    expect(await flippers(page), `${key} held`).toEqual(expected);
    expect((await state(page)).held).toEqual([expected.left, expected.right]);
    await page.keyboard.up(key);
    expect(await flippers(page), `${key} released`).toEqual({ left: false, right: false });
  }
  // Mouse buttons over the display, alone and together.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'left' });
  expect(await flippers(page), 'Left mouse button').toEqual({ left: true, right: false });
  await page.mouse.down({ button: 'right' });
  expect(await flippers(page), 'Both mouse buttons').toEqual({ left: true, right: true });
  await page.mouse.up({ button: 'left' });
  expect(await flippers(page), 'Right mouse button alone').toEqual({ left: false, right: true });
  await page.mouse.up({ button: 'right' });
  expect(await flippers(page)).toEqual({ left: false, right: false });
  // Gamepad: shoulder buttons.
  await padState(page, 0, { button: [4, true] });
  await expect.poll(async () => (await state(page)).held).toEqual([true, false]);
  expect(await flippers(page)).toEqual({ left: true, right: false });
  await padState(page, 0, { button: [4, false] });
  await padState(page, 0, { button: [5, true] });
  await expect.poll(async () => (await state(page)).held).toEqual([false, true]);
  await padState(page, 0, { button: [5, false] });
  await expect.poll(async () => (await state(page)).held).toEqual([false, false]);

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
    evidenceScope: 'Pin Pong in play in a headless desktop browser on this host; reported, not gated, and not a performance qualification.' };
  await testInfo.attach('pinpong-performance.json', { body: Buffer.from(JSON.stringify(performanceMetrics, null, 2)), contentType: 'application/json' });
  testInfo.annotations.push({ type: 'performance', description: `simulationSpeedRatio=${performanceMetrics.simulationSpeedRatio.toFixed(3)} rawSpeedRatio=${rawSpeedRatio.toFixed(3)}` });
  // The sound board NoCPU reconstructs from the schematic (DICE has none)
  // generates a full 48 kHz stream; tools/reference/games/pinpong.py checks its content.
  const played = await state(page);
  expect(played.audio.generatedSamples, 'A reconstructed 48 kHz stream').toBeGreaterThan(48000 * 5);
  await page.screenshot({ path: testInfo.outputPath('pinpong-play.png') });

  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Pin Pong: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('press Start to serve the next one');
  await expect(help).toContainText('last of the 3 balls');
  await expect(help).toContainText("reconstructed by NoCPU from Atari's schematic");
  for (const [label, keys] of [['Left flipper', ['Z', '←']], ['Right flipper', ['/', '→']], ['Insert coin', ['Enter']], ['Start game / serve ball', ['1']]] as const) {
    await expect(help.locator('dl.controls-help > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText([...keys]);
  }
  await expect(page.getByTestId('mouse-help')).toContainText('right button to raise the right flipper');
  await testInfo.attach('pinpong-browser.json', { body: Buffer.from(JSON.stringify({ cold, performanceMetrics }, null, 2)), contentType: 'application/json' });
});

test('Pin Pong DIP settings reach the original switches: two credits, and the game ends after the last ball', { tag: '@game-pinpong' }, async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('pinpong');
  await expect(page.getByTestId('coinage')).toHaveValue('1');
  await expect(page.getByTestId('free-ball')).toHaveValue('1');
  await expect(page.getByTestId('balls')).toHaveValue('3');
  await expect(page.getByTestId('binding-p1Fire')).toContainText('Z');
  await expect(page.getByTestId('mouse-slot')).toHaveValue('0');
  await expect(page.getByTestId('free-game')).toHaveValue('0');
  await expect(page.getByTestId('tone-value')).toHaveText('100%');
  await page.getByTestId('coinage').selectOption('2');
  await page.getByTestId('free-ball').selectOption('0');
  await page.getByTestId('free-game').selectOption('50000');
  await page.getByTestId('tone').fill('50');
  await expect(page.getByTestId('tone-value')).toHaveText('50%');
  await page.reload();
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('pinpong');
  await expect(page.getByTestId('coinage')).toHaveValue('2');
  const cold = await launch(page, 'pinpong');
  // The worker only reports options the core accepted as the packed DIP.
  expect(cold.gameOptions).toEqual({ coinage: 2, freeBall: 0, balls: 3, freeGame: 50000, toneOhms: 800 });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('Insert a coin for two games');
  await expect(page.locator('#game-help-content')).toContainText('The free ball is switched off.');
  await expect(page.locator('#game-help-content')).toContainText('A score of 50,000 earns a free game.');
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();

  // One coin, two games. Untouched flippers let each ball drain; Start serves
  // the next until the third is lost and the game ends. The ball's path, and
  // so how long it takes to drain, depends on when the coin and Start land, so
  // the circuit is reset cold under the held clock first: from simulated time
  // zero the run no longer depends on how fast this engine paced it before.
  await holdClock(page, true);
  const paced = (await state(page)).identity.resetId;
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await state(page)).identity.resetId).toBeGreaterThan(paced);
  const cold0 = await state(page);
  expect([cold0.nativeRunning, BigInt(cold0.timePs)], 'A cold, held circuit at simulated time zero').toEqual([false, 0n]);
  await coin(page);
  await start(page);
  let s = await stepUntil(page, (value) => value.nativeRunning, 300_000);
  expect(s.nativeRunning).toBe(true);
  for (let served = 1; served <= 3; served += 1) {
    s = await stepUntil(page, (value) => !value.nativeRunning || value.playerScores[1] === served, 1_000_000, 100_000);
    expect(s.playerScores[1], `Ball ${served} served`).toBe(served);
    // Wait (simulated) for the ball to drain, then serve the next.
    await stepClock(page, 12_000_000);
    if (served < 3) { expect((await state(page)).nativeRunning).toBe(true); await start(page); }
  }
  s = await stepUntil(page, (value) => !value.nativeRunning, 10_000_000, 200_000);
  expect(s.nativeRunning, 'The game ends after the third ball').toBe(false);
  expect(s.playerScores[1]).toBe(3);
  // The ball scored on its way down, and each hit rang the reconstructed
  // sound board at full drive (+-3.85 V at the attenuator, 15400 in PCM).
  expect(s.playerScores[0], 'Points scored').toBeGreaterThan(0);
  expect(s.audio.generatedPeak, 'Hits sound').toBe(15400);
  // The second credit: Start begins another cleared game without a coin.
  await stepClock(page, 500_000);
  await start(page);
  s = await stepUntil(page, (value) => value.nativeRunning, 300_000);
  expect(s.nativeRunning, 'The second credit starts a game').toBe(true);
  await stepClock(page, 100_000);
  expect((await state(page)).playerScores).toEqual([0, 1]);
  await holdClock(page, false);

  // Apply & reset with a changed setting restarts the circuit cold with it.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('balls').selectOption('5');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ coinage: 2, freeBall: 0, balls: 5, freeGame: 50000, toneOhms: 800 });
  const reset = await state(page);
  expect(reset.identity.resetId).toBeGreaterThan(cold.identity.resetId);
  expect(reset.nativeRunning).toBe(false);
});

test('Pin Pong appears as a playable game on phone-sized Play screens (layout only)', { tag: '@game-pinpong' }, async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    const row = page.locator('.play-list').getByTestId('game-pinpong');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height + 0.001, 'The Pin Pong row is at least 44px tall').toBeGreaterThanOrEqual(44);
    await row.focus();
    await expect(page.getByTestId('play-preview')).toHaveText('Play');
    await expect(page.getByTestId('play-preview')).toBeInViewport();
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, 'Play must not scroll sideways').toBeLessThanOrEqual(card.client + 1);
  }
});
