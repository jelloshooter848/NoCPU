// SPDX-License-Identifier: GPL-3.0-or-later
// Anti-Aircraft in a desktop browser: the player's own ROM (missing-ROM path
// without it), credits and Start, the three aim-and-fire buttons of each
// launcher by keyboard and gamepads, scoring, the plane-type and play-time
// settings, help and the inherited absent sound. The private-ROM test needs
// NOCPU_ROM_DIR and is skipped without it (CI runs it in the rom-browser job).
// Circuit behavior is asserted in simulated time on the held clock; the
// original/native/Wasm comparison (tools/compare-rom-games.py) is the
// accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importZip, installGamepads, padState, titleSettings } from './app-helpers';
import { holdClock, presented, state, stepClock, stepUntil, untilCircuit } from './game-helpers';
import { antiaircraft } from '../../web/src/games/antiaircraft';

// ROM-derived frames must never enter retained traces or reports.
test.use({ trace: 'off', video: 'off' });
const privateDir = process.env.NOCPU_ROM_DIR;

// Original raster (tools/reference/games/antiaircraft.py): a barrel aimed
// high or to the middle reaches row 370 (left launcher columns 47..59 or
// 69..83, right 518..530 or 494..508); aimed low it reaches row 384 only
// (left 66..83, right 494..511). One pixel inside each tip tells the angle.
const TIPS = [{ high: [53, 370], middle: [76, 370], low: [75, 384] }, { high: [524, 370], middle: [501, 370], low: [502, 384] }];
async function aims(page: Page): Promise<(string | null)[]> {
  // Read the frame of the circuit's current time, once it is presented.
  await presented(page, await state(page));
  return page.getByTestId('game-canvas').evaluate((element, tips) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    const lit = ([x, y]: number[]) => context.getImageData(x, y, 1, 1).data[0] > 100;
    return tips.map((tip) => lit(tip.high) ? 'high' : lit(tip.middle) ? 'middle' : lit(tip.low) ? 'low' : null);
  }, TIPS);
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
/** Import the private ZIP and start the game from Play on a ?debug page. */
async function launchWithRom(page: Page): Promise<any> {
  await page.goto('./?debug');
  await titleSettings(page);
  await importZip(page, 'antiaircraft', 'antiaircraft.zip', readFileSync(join(privateDir!, 'antiairc.zip')));
  await expect(page.getByTestId('rom-import-status')).toContainText('ROM validated');
  await page.getByTestId('back').click();
  await page.getByTestId('open-library').click();
  await page.getByTestId('game-antiaircraft').click();
  await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  return untilCircuit(page, (value) => value.gameId === 'antiaircraft' && BigInt(value.timePs) >= 800_000_000_000n, 2);
}

test('Anti-Aircraft needs the player\'s ROM: Play explains the import, and help and settings describe the original controls', { tag: '@game-antiaircraft' }, async ({ page }) => {
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-antiaircraft')).toBeVisible();
  await page.getByTestId('game-antiaircraft').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Anti-Aircraft');
  await expect(page.getByTestId('play-detail-rom')).not.toHaveText('No ROM needed');
  if (antiaircraft.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  await page.getByTestId('game-antiaircraft').click();
  await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
  await expect(page.locator('.rom-requirements li')).toHaveText(['aa.k1']);
  await page.getByTestId('play-selected').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'game-info');
  await expect(page.getByTestId('rom-launch-message')).toBeVisible();
  await expect(page.getByTestId('game-audio-status')).toContainText('unavailable');
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('antiaircraft');
  await expect(page.getByTestId('coinage')).toHaveValue('1');
  await expect(page.getByTestId('plane-type')).toHaveValue('0');
  await expect(page.getByTestId('playtime')).toHaveValue('61');
  for (const [action, key] of [['p1Up', 'Q'], ['p1Fire', 'A'], ['p1Down', 'Z'], ['p2Up', 'O'], ['p2Fire', 'L'], ['p2Down', '.']] as const) {
    await expect(page.getByTestId(`binding-${action}`)).toContainText(key);
  }
});

test('Anti-Aircraft plays from the private ROM: credits, both launchers\' aim-and-fire buttons by keyboard and gamepads, scoring, settings and silence', { tag: '@game-antiaircraft' }, async ({ page }, testInfo) => {
  test.skip(!privateDir, 'Private original ROM fixture directory is unavailable; gameplay not exercised.');
  test.setTimeout(600_000);
  await installGamepads(page, 2);
  const cold = await launchWithRom(page);
  expect(cold.gameOptions).toEqual({ coinage: 1, planeType: 0, playtimeOhms: 830000 });
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  expect(cold.nativeRunning).toBe(false);

  await holdClock(page, true);
  await start(page);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'Start without a credit does not start a game').toBe(false);
  await coin(page);
  expect((await state(page)).nativeRunning, 'A coin alone does not start a game').toBe(false);
  await start(page);
  const playing = await stepUntil(page, (value) => value.nativeRunning, 300_000);
  expect(playing.nativeRunning, 'Start with a credit begins the game').toBe(true);
  expect(playing.playerScores).toEqual([0, 0]);
  await stepClock(page, 200_000);
  expect(await aims(page), 'Both launchers start at the middle angle').toEqual(['middle', 'middle']);
  // Let any missile still flying from attract mode burst first.
  await stepClock(page, 2_000_000);

  // Keyboard: Q/A/Z aim the left launcher high/middle/low and fire, O/L/. the
  // right one. A launcher has one missile at a time: a press while its missile
  // flies (until it bursts, at most about 1.6 s) changes nothing.
  await page.getByTestId('game-canvas').focus();
  // The worker must hold the button before the clock steps, and release it after.
  const heldCount = async () => (await state(page)).held.filter(Boolean).length;
  const tap = async (key: string) => {
    await page.keyboard.down(key); await expect.poll(heldCount).toBe(1); await stepClock(page, 100_000);
    await page.keyboard.up(key); await expect.poll(heldCount).toBe(0); await stepClock(page, 100_000);
  };
  await tap('KeyQ');
  expect(await aims(page), 'KeyQ').toEqual(['high', 'middle']);
  await tap('KeyZ');
  expect(await aims(page), 'KeyZ while the missile flies').toEqual(['high', 'middle']);
  await stepClock(page, 2_000_000);
  for (const [key, expected] of [['KeyZ', ['low', 'middle']], ['KeyA', ['middle', 'middle']],
    ['KeyO', ['middle', 'high']], ['Period', ['middle', 'low']], ['KeyL', ['middle', 'middle']]] as const) {
    await tap(key);
    expect(await aims(page), key).toEqual(expected);
    await stepClock(page, 2_000_000);
  }
  // Gamepads: controller 1 is the left launcher, controller 2 the right one.
  for (const [pad, button, expected] of [[0, 3, ['high', 'middle']], [1, 1, ['high', 'low']], [0, 1, ['low', 'low']], [1, 3, ['low', 'high']]] as const) {
    await padState(page, pad, { button: [button, true] });
    await expect.poll(heldCount).toBe(1);
    await stepClock(page, 100_000);
    await padState(page, pad, { button: [button, false] });
    await expect.poll(heldCount).toBe(0);
    await stepClock(page, 100_000);
    expect(await aims(page), `pad ${pad + 1} button ${button}`).toEqual(expected);
    await stepClock(page, 2_000_000);
  }
  // Holding a button keeps firing: both launchers hold their high angle until
  // a plane is hit and a launcher scores.
  await page.keyboard.down('KeyQ'); await page.keyboard.down('KeyO');
  await expect.poll(heldCount).toBe(2);
  const scored = await stepUntil(page, (value) => value.playerScores[0] + value.playerScores[1] > 0, 40_000_000, 250_000);
  await page.keyboard.up('KeyQ'); await page.keyboard.up('KeyO');
  await expect.poll(heldCount).toBe(0);
  expect(scored.playerScores[0] + scored.playerScores[1], 'A hit plane scores for a launcher').toBeGreaterThan(0);
  expect(scored.nativeRunning).toBe(true);
  expect((await state(page)).audio.generatedSamples, 'Inherited absent audio').toBeLessThanOrEqual(1);

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
  testInfo.annotations.push({ type: 'performance', description: `simulationSpeedRatio=${(simulationSeconds / ((pacedEnd.wall - paced.wall) / 1000)).toFixed(3)} rawSpeedRatio=${rawSpeedRatio.toFixed(3)}` });

  // Help lists the original controls and rules.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Anti-Aircraft: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('holding it keeps firing');
  await expect(help).toContainText('A coin inserted during a game ends it');
  for (const [label, keys] of [['Left launcher: aim high and fire', ['Q']], ['Right launcher: aim low and fire', ['.']]] as const) {
    await expect(help.locator('dl.controls-help > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText([...keys]);
  }
  await page.getByTestId('back').click();

  // Settings: UFOs, two credits a coin and the shortest play time, applied
  // with a cold reset. At 220 kOhm D9 ends a game ln 3 * R * 100 uF = 24.2 s
  // after Start, and the second credit starts another game.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('plane-type').selectOption('1');
  await page.getByTestId('coinage').selectOption('2');
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ coinage: 2, planeType: 1, playtimeOhms: 220000 });
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  await holdClock(page, true);
  await stepClock(page, 1_000_000);
  await coin(page);
  const first = await start(page);
  const began = await stepUntil(page, (value) => value.nativeRunning, 300_000);
  expect(began.nativeRunning).toBe(true);
  await stepClock(page, 23_500_000 - Number((BigInt((await state(page)).timePs) - BigInt(first.timePs)) / 1_000_000n));
  expect((await state(page)).nativeRunning, 'Still in play shortly before 24.2 s').toBe(true);
  const ended = await stepUntil(page, (value) => !value.nativeRunning, 1_500_000, 50_000);
  expect(ended.nativeRunning, 'The play timer ends the game').toBe(false);
  await start(page);
  expect((await stepUntil(page, (value) => value.nativeRunning, 300_000)).nativeRunning, 'The coin\'s second credit starts another game').toBe(true);
  await holdClock(page, false);
});
