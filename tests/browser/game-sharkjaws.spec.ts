// SPDX-License-Identifier: GPL-3.0-or-later
// Shark Jaws in a desktop browser: the player's own ROMs (missing-ROM path
// without them), credits and Start, the diver's four-way stick by keyboard and
// gamepad, catching fish, the play-time and coinage settings, help and the
// inherited absent sound. The private-ROM test needs NOCPU_ROM_DIR and is
// skipped without it (CI runs it in the rom-browser job). Circuit behavior is
// asserted in simulated time on the held clock; the original/native/Wasm
// comparison (tools/compare-rom-games.py) is the accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importZip, installGamepads, padState, titleSettings } from './app-helpers';
import { holdClock, presented, state, stepClock as stepWhole, stepUntil, untilCircuit } from './game-helpers';

// Shark Jaws is heavy: Playwright's Firefox build (baseline WebAssembly
// compiler only) needs more than the page's 5 s debug-request limit for a
// whole simulated second, so the held clock steps a quarter second at a time.
async function stepClock(page: Page, microseconds: number): Promise<void> {
  for (let left = microseconds; left > 0; left -= 250_000) await stepWhole(page, Math.min(250_000, left));
}
import { sharkjaws } from '../../web/src/games/sharkjaws';

// ROM-derived frames must never enter retained traces or reports.
test.use({ trace: 'off', video: 'off' });
const privateDir = process.env.NOCPU_ROM_DIR;

interface Thing { x: number; y: number; w: number; h: number }
/** Objects of the presented raster's playfield (below the score, row 101 on;
 * tools/reference/games/sharkjaws.py): the diver is 24..32 x 18..24 pixels,
 * the shark about 60 x 25 and a fish 10 x 8. */
async function objects(page: Page): Promise<{ diver: Thing | null; fish: Thing[]; shark: Thing | null }> {
  await presented(page, await state(page));
  const found: Thing[] = await page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const W = canvas.width, H = canvas.height, data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
    const lit = (i: number) => i >= 101 * W && data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] > 120;
    const seen = new Uint8Array(W * H), result: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < W * H; i += 1) {
      if (seen[i] || !lit(i)) continue;
      const stack = [i]; seen[i] = 1; let x0 = W, x1 = 0, y0 = H, y1 = 0;
      while (stack.length) {
        const j = stack.pop()!, x = j % W, y = (j / W) | 0;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
          const xx = x + dx, yy = y + dy, k = yy * W + xx;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && !seen[k] && lit(k)) { seen[k] = 1; stack.push(k); }
        }
      }
      result.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    return result;
  });
  const divers = found.filter((o) => o.w >= 24 && o.w <= 32 && o.h >= 18 && o.h <= 24);
  return { diver: divers.length === 1 ? divers[0] : null, fish: found.filter((o) => o.w >= 8 && o.w <= 12 && o.h >= 6 && o.h <= 10),
    shark: found.find((o) => o.w >= 50 && o.h >= 20 && o.h <= 30) ?? null };
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
async function launchWithRom(page: Page): Promise<any> {
  await page.goto('./?debug');
  await titleSettings(page);
  await importZip(page, 'sharkjaws', 'sharkjaws.zip', readFileSync(join(privateDir!, 'sharkjaw.zip')));
  await expect(page.getByTestId('rom-import-status')).toContainText('ROM validated');
  await page.getByTestId('back').click();
  await page.getByTestId('open-library').click();
  await page.getByTestId('game-sharkjaws').click();
  await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  return untilCircuit(page, (value) => value.gameId === 'sharkjaws' && BigInt(value.timePs) >= 800_000_000_000n, 2);
}

test('Shark Jaws needs the player\'s ROMs: Play explains the import, and help and settings describe the original controls', { tag: '@game-sharkjaws' }, async ({ page }) => {
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-sharkjaws')).toBeVisible();
  await page.getByTestId('game-sharkjaws').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Shark Jaws');
  await expect(page.getByTestId('play-detail-rom')).not.toHaveText('No ROM needed');
  if (sharkjaws.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  await page.getByTestId('game-sharkjaws').click();
  await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
  await expect(page.locator('.rom-requirements li')).toHaveText(['004182.1da', '004183.1db']);
  await page.getByTestId('play-selected').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'game-info');
  await expect(page.getByTestId('rom-launch-message')).toBeVisible();
  await expect(page.getByTestId('game-audio-status')).toContainText('unavailable');
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('sharkjaws');
  await expect(page.getByTestId('coinage')).toHaveValue('1');
  await expect(page.getByTestId('playtime')).toHaveValue('50');
  for (const [action, key] of [['p1Up', '↑'], ['p1Down', '↓'], ['p1Left', '←'], ['p1Right', '→']] as const) {
    await expect(page.getByTestId(`binding-${action}`)).toContainText(key);
  }
});

test('Shark Jaws plays from the private ROMs: credits, the diver\'s stick by keyboard and gamepad, catching fish, the timer and silence', { tag: '@game-sharkjaws' }, async ({ page }, testInfo) => {
  test.skip(!privateDir, 'Private original ROM fixture directory is unavailable; gameplay not exercised.');
  test.setTimeout(900_000);
  await installGamepads(page, 1);
  const cold = await launchWithRom(page);
  expect(cold.gameOptions).toEqual({ coinage: 1, playtimeOhms: 970000 });
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
  await stepClock(page, 600_000);

  // Keyboard and gamepad: each direction moves the diver that way. The shark
  // may catch the diver on the way; such a move is retried.
  await page.getByTestId('game-canvas').focus();
  const stick = async () => (await state(page)).inputs.directions;
  const move = async (press: () => Promise<void>, release: () => Promise<void>, dx: number, dy: number, label: string) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // Room to move: away from the playfield edge it is about to test.
      const start = (await objects(page)).diver;
      const away = !start ? null : dx < 0 && start.x < 140 ? 'ArrowRight' : dx > 0 && start.x > 440 ? 'ArrowLeft'
        : dy < 0 && start.y < 200 ? 'ArrowDown' : dy > 0 && start.y > 340 ? 'ArrowUp' : null;
      if (away) {
        await page.keyboard.down(away); await expect.poll(async () => JSON.stringify(await stick())).not.toBe(JSON.stringify([0, 0]));
        await stepClock(page, 800_000);
        await page.keyboard.up(away); await expect.poll(async () => JSON.stringify(await stick())).toBe(JSON.stringify([0, 0]));
      }
      const before = (await objects(page)).diver;
      await press(); await expect.poll(async () => JSON.stringify(await stick())).not.toBe(JSON.stringify([0, 0]));
      await stepClock(page, 400_000);
      await release(); await expect.poll(async () => JSON.stringify(await stick())).toBe(JSON.stringify([0, 0]));
      const after = (await objects(page)).diver;
      if (before && after) {
        // The diver moves at least 10 pixels that way, and mostly that way:
        // its picture's box may shift a few pixels across as it swims.
        const moved = [after.x - before.x, after.y - before.y];
        const along = dx ? moved[0] * dx : moved[1] * dy, across = Math.abs(dx ? moved[1] : moved[0]);
        const ok = along >= 10 && across <= 12 && along > 3 * across;
        expect(ok, `${label}: moved ${JSON.stringify(moved)} from ${JSON.stringify(before)}`).toBe(true);
        return;
      }
      await stepClock(page, 2_000_000);
    }
    throw new Error(`${label}: the diver was not visible to move`);
  };
  for (const [key, dx, dy] of [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['KeyW', 0, -1], ['KeyD', 1, 0]] as const) {
    await move(() => page.keyboard.down(key), () => page.keyboard.up(key), dx, dy, key);
  }
  // Gamepad: the d-pad (14 left, 15 right) and the left stick's vertical axis.
  await move(() => padState(page, 0, { button: [14, true] }), () => padState(page, 0, { button: [14, false] }), -1, 0, 'pad left');
  await move(() => padState(page, 0, { axis: [1, 1] }), () => padState(page, 0, { axis: [1, 0] }), 0, 1, 'pad down');

  // Steer the diver to the nearest fish until it catches one: a point.
  const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const;
  const held = new Set<string>();
  const hold = async (key: string, on: boolean) => { if (on && !held.has(key)) { await page.keyboard.down(key); held.add(key); } else if (!on && held.has(key)) { await page.keyboard.up(key); held.delete(key); } };
  let caught = await state(page);
  for (let step = 0; step < 600 && caught.playerScores[0] === 0; step += 1) {
    const { diver, fish } = await objects(page);
    const target = diver && fish.length ? fish.reduce((a, b) => Math.hypot(a.x - diver.x, a.y - diver.y) < Math.hypot(b.x - diver.x, b.y - diver.y) ? a : b) : null;
    await hold(keys.left, !!(diver && target && target.x < diver.x - 4)); await hold(keys.right, !!(diver && target && target.x > diver.x + 4));
    await hold(keys.up, !!(diver && target && target.y < diver.y - 4)); await hold(keys.down, !!(diver && target && target.y > diver.y + 4));
    await stepClock(page, 100_000);
    caught = await state(page);
  }
  for (const key of Object.values(keys)) await hold(key, false);
  expect(caught.playerScores[0], 'Catching a fish scores a point').toBeGreaterThan(0);
  expect(caught.nativeRunning).toBe(true);
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
  await expect(page.locator('#help-heading')).toHaveText('Shark Jaws: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('each catch scores a point');
  for (const [label, keysShown] of [['Diver up', ['↑', 'W']], ['Diver left', ['←', 'A']]] as const) {
    await expect(help.locator('dl.controls-help > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText([...keysShown]);
  }
  await page.getByTestId('back').click();

  // Settings: two credits a coin and the shortest play time, applied with a
  // cold reset. At 470 kOhm N9A ends a game ln 3 * R * 100 uF = 51.6 s after
  // Start, and the second credit starts another game.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('coinage').selectOption('2');
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ coinage: 2, playtimeOhms: 470000 });
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  await holdClock(page, true);
  await stepClock(page, 1_000_000);
  await coin(page);
  const first = await start(page);
  expect((await stepUntil(page, (value) => value.nativeRunning, 300_000)).nativeRunning).toBe(true);
  await stepClock(page, 51_000_000 - Number((BigInt((await state(page)).timePs) - BigInt(first.timePs)) / 1_000_000n));
  expect((await state(page)).nativeRunning, 'Still in play shortly before 51.6 s').toBe(true);
  const ended = await stepUntil(page, (value) => !value.nativeRunning, 1_500_000, 50_000);
  expect(ended.nativeRunning, 'The play timer ends the game').toBe(false);
  await start(page);
  expect((await stepUntil(page, (value) => value.nativeRunning, 300_000)).nativeRunning, 'The coin\'s second credit starts another game').toBe(true);
  await holdClock(page, false);
});
