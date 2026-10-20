// SPDX-License-Identifier: GPL-3.0-or-later
// Jet Fighter in a desktop browser: the player's own ROMs (missing-ROM path
// without them), Start 1 against the machine and Start 2 for two players, both
// jets' turn, speed and fire controls by keyboard and gamepads, the coinage
// and play-time settings, help and the inherited absent sound. The private-ROM
// test needs NOCPU_ROM_DIR and is skipped without it (CI runs it in the
// rom-browser job). Circuit behavior is asserted in simulated time on the held
// clock; the original/native/Wasm comparison (tools/compare-rom-games.py) is
// the accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importZip, installGamepads, padState, titleSettings } from './app-helpers';
import { holdClock, presented, state, stepClock as stepWhole, stepUntil, untilCircuit } from './game-helpers';
import { jetfighter } from '../../web/src/games/jetfighter';

// ROM-derived frames must never enter retained traces or reports.
test.use({ trace: 'off', video: 'off' });
const privateDir = process.env.NOCPU_ROM_DIR;

// Playwright's Firefox build (baseline WebAssembly compiler only) may need
// more than the page's 5 s debug-request limit for a whole simulated second.
async function stepClock(page: Page, microseconds: number): Promise<void> {
  for (let left = microseconds; left > 0; left -= 250_000) await stepWhole(page, Math.min(250_000, left));
}
interface Jet { x: number; y: number }
/** Each jet's centre on the presented raster: the largest white or black blob
 * of the sky (below the scores, row 57 on; tools/reference/games/jetfighter.py). */
async function jets(page: Page): Promise<{ white: Jet | null; black: Jet | null; whiteBlobs: number }> {
  await presented(page, await state(page));
  return page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const W = canvas.width, H = canvas.height, data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
    const blobs = (value: number) => {
      const seen = new Uint8Array(W * H), found: { x: number; y: number; n: number }[] = [];
      const is = (i: number) => i >= 57 * W && data[i * 4] === value && data[i * 4 + 1] === value && data[i * 4 + 2] === value;
      for (let i = 0; i < W * H; i += 1) {
        if (seen[i] || !is(i)) continue;
        const stack = [i]; seen[i] = 1; let n = 0, sx = 0, sy = 0;
        while (stack.length) {
          const j = stack.pop()!, x = j % W, y = (j / W) | 0; n += 1; sx += x; sy += y;
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx, yy = y + dy, k = yy * W + xx;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H && !seen[k] && is(k)) { seen[k] = 1; stack.push(k); }
          }
        }
        found.push({ x: sx / n, y: sy / n, n });
      }
      return found;
    };
    const largest = (list: { x: number; y: number; n: number }[]) => {
      const best = list.filter((b) => b.n >= 12).sort((a, b) => b.n - a.n)[0];
      return best ? { x: best.x, y: best.y } : null;
    };
    const white = blobs(255);
    return { white: largest(white), black: largest(blobs(0)), whiteBlobs: white.length };
  });
}
async function coin(page: Page): Promise<void> {
  const base = (await state(page)).switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  await stepUntil(page, (value) => value.switches.coinCompleted[0] === base + 1, 1_000_000);
  await stepClock(page, 200_000);
}
/** Press Start 1 or Start 2 by keyboard (1 and 2). */
async function start(page: Page, player: 1 | 2): Promise<any> {
  const index = player - 1, base = (await state(page)).switches.startCompleted[index];
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.press(player === 1 ? 'Digit1' : 'Digit2');
  return stepUntil(page, (value) => value.switches.startCompleted[index] === base + 1, 1_000_000);
}
async function launchWithRom(page: Page): Promise<any> {
  await page.goto('./?debug');
  await titleSettings(page);
  await importZip(page, 'jetfighter', 'jetfighter.zip', readFileSync(join(privateDir!, 'jetfight.zip')));
  await expect(page.getByTestId('rom-import-status')).toContainText('ROM validated');
  await page.getByTestId('back').click();
  await page.getByTestId('open-library').click();
  await page.getByTestId('game-jetfighter').click();
  await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  return untilCircuit(page, (value) => value.gameId === 'jetfighter' && BigInt(value.timePs) >= 800_000_000_000n, 2);
}

test('Jet Fighter needs the player\'s ROMs: Play explains the import, and help and settings describe the original controls', { tag: '@game-jetfighter' }, async ({ page }) => {
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-jetfighter')).toBeVisible();
  await page.getByTestId('game-jetfighter').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Jet Fighter');
  await expect(page.getByTestId('play-detail-rom')).not.toHaveText('No ROM needed');
  if (jetfighter.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  await page.getByTestId('game-jetfighter').click();
  await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
  await expect(page.locator('.rom-requirements li')).toHaveText(['jet1.a4', 'jet1.j1', 'jet1.j5', 'jet1.k5', 'jet1.m1', 'jet1.r5']);
  await page.getByTestId('play-selected').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'game-info');
  await expect(page.getByTestId('rom-launch-message')).toBeVisible();
  await expect(page.getByTestId('game-audio-status')).toContainText('unavailable');
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('jetfighter');
  await expect(page.getByTestId('coinage')).toHaveValue('1');
  await expect(page.getByTestId('playtime')).toHaveValue('50');
  for (const [action, key] of [['p1Left', 'A'], ['p1Up', 'W'], ['p1Fire', 'F'], ['p2Right', '→'], ['p2Down', '↓'], ['p2Fire', '/']] as const) {
    await expect(page.getByTestId(`binding-${action}`)).toContainText(key);
  }
});

test('Jet Fighter plays from the private ROMs: two players turn, speed up, slow down and fire by keyboard and gamepads; one coin, settings and silence', { tag: '@game-jetfighter' }, async ({ page }, testInfo) => {
  test.skip(!privateDir, 'Private original ROM fixture directory is unavailable; gameplay not exercised.');
  test.setTimeout(900_000);
  await installGamepads(page, 2);
  const cold = await launchWithRom(page);
  expect(cold.gameOptions).toEqual({ coinage: 1, playtimeOhms: 510000 });
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  expect(cold.nativeRunning).toBe(false);

  await holdClock(page, true);
  await start(page, 2);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'Start without a credit does not start a game').toBe(false);
  await coin(page);
  expect((await state(page)).nativeRunning, 'A coin alone does not start a game').toBe(false);
  await start(page, 2);
  const playing = await stepUntil(page, (value) => value.nativeRunning, 300_000);
  expect(playing.nativeRunning, 'One coin and Start 2 begin a two-player game (25 cents for two players)').toBe(true);
  expect(playing.playerScores).toEqual([0, 0]);

  // Both jets start flying straight up the screen: a turn shows as sideways
  // motion. Left turns the white jet left, Right turns the black jet right.
  const directions = async () => (await state(page)).inputs.directions;
  const hold = async (key: string, microseconds: number) => {
    await page.keyboard.down(key); await expect.poll(async () => (await directions()).some(Boolean)).toBe(true);
    await stepClock(page, microseconds);
    await page.keyboard.up(key); await expect.poll(async () => (await directions()).some(Boolean)).toBe(false);
  };
  // Jets hide while they cross the score band at the top: step on until both show.
  const visible = async () => {
    let seen = await jets(page);
    for (let wait = 0; wait < 40 && !(seen.white && seen.black); wait += 1) { await stepClock(page, 50_000); seen = await jets(page); }
    expect(seen.white && seen.black, `Both jets in the sky: ${JSON.stringify(seen)}`).toBeTruthy();
    return { ...seen, t: Number(BigInt((await state(page)).timePs) / 1_000_000n) / 1e6 } as { white: Jet; black: Jet; t: number };
  };
  let before = await visible();
  await hold('KeyA', 400_000); await stepClock(page, 300_000);
  let after = await visible();
  expect(after.white.x, 'A turns the white jet left').toBeLessThan(before.white.x - 5);
  expect(Math.abs(after.black.x - before.black.x), 'The black jet flies on straight').toBeLessThan(3);
  before = after;
  await hold('ArrowRight', 400_000); await stepClock(page, 300_000);
  after = await visible();
  expect(after.black.x, '→ turns the black jet right').toBeGreaterThan(before.black.x + 5);

  // Speed: W and ↑ make a jet faster, S and ↓ slower (pixels per simulated
  // second; the sky wraps around the whole 576 x 432 screen).
  const wrap = (d: number, m: number) => ((d + m / 2) % m + m) % m - m / 2;
  const speed = async (key: string | null, color: 'white' | 'black') => {
    if (key) { await page.keyboard.down(key); await expect.poll(async () => (await directions()).some(Boolean)).toBe(true); await stepClock(page, 200_000); }
    const a = await visible();
    await stepClock(page, 600_000);
    const b = await visible();
    if (key) { await page.keyboard.up(key); await expect.poll(async () => (await directions()).some(Boolean)).toBe(false); }
    return Math.hypot(wrap(b[color].x - a[color].x, 576), wrap(b[color].y - a[color].y, 432)) / (b.t - a.t);
  };
  const distance = speed;
  const cruise = await distance(null, 'white');
  expect(await distance('KeyW', 'white'), 'W makes the white jet faster').toBeGreaterThan(cruise * 1.15);
  await stepClock(page, 1_000_000);
  const cruiseAgain = await distance(null, 'white');
  expect(await distance('KeyS', 'white'), 'S makes the white jet slower').toBeLessThan(cruiseAgain * 0.85);
  const blackCruise = await distance(null, 'black');
  expect(await distance('ArrowUp', 'black'), '↑ makes the black jet faster').toBeGreaterThan(blackCruise * 1.15);

  // Fire: F fires a white shell, / a black one; gamepads fire with Y.
  const shells = async () => (await jets(page)).whiteBlobs;
  await page.keyboard.down('KeyF'); await expect.poll(async () => (await state(page)).held).toEqual([true, false]);
  await stepClock(page, 150_000);
  await page.keyboard.up('KeyF'); await expect.poll(async () => (await state(page)).held).toEqual([false, false]);
  await stepClock(page, 100_000);
  expect(await shells(), 'A white shell is in the sky').toBeGreaterThan(1);
  for (const pad of [0, 1]) {
    await padState(page, pad, { button: [3, true] });
    await expect.poll(async () => (await state(page)).held[pad]).toBe(true);
    await stepClock(page, 100_000);
    await padState(page, pad, { button: [3, false] });
    await expect.poll(async () => (await state(page)).held[pad]).toBe(false);
  }
  // Gamepad sticks: controller 1 turns the white jet, controller 2 the black.
  await padState(page, 1, { axis: [0, -1] });
  await expect.poll(async () => (await directions()).some(Boolean)).toBe(true);
  await stepClock(page, 400_000);
  await padState(page, 1, { axis: [0, 0] });
  await expect.poll(async () => (await directions()).some(Boolean)).toBe(false);
  expect((await jets(page)).black, 'The black jet still flies').toBeTruthy();
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

  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Jet Fighter: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('against the machine');
  for (const [label, keys] of [['White jet fire', ['F']], ['Black jet turn left', ['←']], ['Start 2 players', ['2']]] as const) {
    await expect(help.locator('dl.controls-help > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText([...keys]);
  }
  await page.getByTestId('back').click();

  // Settings: two coins for two players and the shortest play time, applied
  // with a cold reset. One coin then refuses Start 2 and allows Start 1 (the
  // machine flies the black jet); at 10 kOhm the game lasts 54.6 s.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('coinage').selectOption('2');
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ coinage: 2, playtimeOhms: 10000 });
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  await holdClock(page, true);
  await stepClock(page, 1_000_000);
  await coin(page);
  await start(page, 2);
  await stepClock(page, 300_000);
  expect((await state(page)).nativeRunning, 'One coin is not enough for two players with this setting').toBe(false);
  const first = await start(page, 1);
  expect((await stepUntil(page, (value) => value.nativeRunning, 300_000)).nativeRunning, 'Start 1 begins a game against the machine').toBe(true);
  await stepClock(page, 54_000_000 - Number((BigInt((await state(page)).timePs) - BigInt(first.timePs)) / 1_000_000n));
  expect((await state(page)).nativeRunning, 'Still in play shortly before 54.6 s').toBe(true);
  const ended = await stepUntil(page, (value) => !value.nativeRunning, 1_500_000, 50_000);
  expect(ended.nativeRunning, 'The play timer ends the game').toBe(false);
  await holdClock(page, false);
});
