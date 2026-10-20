// SPDX-License-Identifier: GPL-3.0-or-later
// Attack in a desktop browser: the player's own ROMs (missing-ROM path
// without them), the coin starting the game, the ship's move, gun and fire
// controls and the plane's turn, fire and speed controls by keyboard and
// gamepads, a coin during play, the play-time setting, help and sound. The
// private-ROM test needs NOCPU_ROM_DIR and is skipped without it (CI runs it in
// the rom-browser job). Circuit behavior is asserted in simulated time on the
// held clock; the original/native/Wasm comparison (tools/compare-rom-games.py)
// is the accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importZip, installGamepads, padState, titleSettings } from './app-helpers';
import { holdClock, presented, state, stepClock as stepWhole, stepUntil, untilCircuit } from './game-helpers';
import { attack } from '../../web/src/games/attack';

// ROM-derived frames must never enter retained traces or reports.
test.use({ trace: 'off', video: 'off' });
const privateDir = process.env.NOCPU_ROM_DIR;

// Playwright's Firefox build (baseline WebAssembly compiler only) may need
// more than the page's 5 s debug-request limit for a whole simulated second.
async function stepClock(page: Page, microseconds: number): Promise<void> {
  for (let left = microseconds; left > 0; left -= 250_000) await stepWhole(page, Math.min(250_000, left));
}
interface Point { x: number; y: number }
/** White objects on the presented raster (tools/reference/games/attack.py):
 * the ship's centre column (rows 360..380), the plane (the largest blob of
 * rows 85..354, under the scores) and the small blobs there (bullets). */
async function objects(page: Page): Promise<{ ship: number | null; plane: Point | null; bullets: Point[] }> {
  await presented(page, await state(page));
  return page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const W = canvas.width, H = canvas.height, data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
    const white = (i: number) => data[i * 4] > 200 && data[i * 4 + 1] > 200 && data[i * 4 + 2] > 200;
    let sx = 0, sn = 0;
    for (let y = 360; y < 381; y += 1) for (let x = 0; x < W; x += 1) if (white(y * W + x)) { sx += x; sn += 1; }
    const seen = new Uint8Array(W * H), found: { x: number; y: number; n: number }[] = [];
    const sky = (i: number) => i >= 85 * W && i < 355 * W && white(i);
    for (let i = 0; i < W * H; i += 1) {
      if (seen[i] || !sky(i)) continue;
      const stack = [i]; seen[i] = 1; let n = 0, bx = 0, by = 0;
      while (stack.length) {
        const j = stack.pop()!, x = j % W, y = (j / W) | 0; n += 1; bx += x; by += y;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx, yy = y + dy, k = yy * W + xx;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && !seen[k] && sky(k)) { seen[k] = 1; stack.push(k); }
        }
      }
      found.push({ x: bx / n, y: by / n, n });
    }
    const plane = found.filter((b) => b.n >= 40).sort((a, b) => b.n - a.n)[0];
    return { ship: sn >= 20 ? sx / sn : null, plane: plane ? { x: plane.x, y: plane.y } : null,
      bullets: found.filter((b) => b.n < 40).map((b) => ({ x: b.x, y: b.y })) };
  });
}
async function coin(page: Page): Promise<void> {
  const base = (await state(page)).switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  await stepUntil(page, (value) => value.switches.coinCompleted[0] === base + 1, 1_000_000);
}
async function launchWithRom(page: Page): Promise<any> {
  await page.goto('./?debug');
  await titleSettings(page);
  await importZip(page, 'attack', 'attack.zip', readFileSync(join(privateDir!, 'attckexd.zip')));
  await expect(page.getByTestId('rom-import-status')).toContainText('ROM validated');
  await page.getByTestId('back').click();
  await page.getByTestId('open-library').click();
  await page.getByTestId('game-attack').click();
  await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  return untilCircuit(page, (value) => value.gameId === 'attack' && BigInt(value.timePs) >= 800_000_000_000n, 2);
}

test('Attack needs the player\'s ROMs: Play explains the import, and help and settings describe the original controls', { tag: '@game-attack' }, async ({ page }) => {
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-attack')).toBeVisible();
  await page.getByTestId('game-attack').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Attack');
  await expect(page.getByTestId('play-detail-rom')).not.toHaveText('No ROM needed');
  if (attack.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  await page.getByTestId('game-attack').click();
  await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
  await expect(page.locator('.rom-requirements li')).toHaveText(['attack.a1', 'attack.b1', 'attack.c1', 'attack.d1', 'attack.j6', 'attack.k6']);
  await page.getByTestId('play-selected').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'game-info');
  await expect(page.getByTestId('rom-launch-message')).toBeVisible();
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('attack');
  await expect(page.getByTestId('playtime')).toHaveValue('75');
  await expect(page.getByTestId('coinage')).toHaveCount(0);
  for (const [action, key] of [['p1Left', 'A'], ['p1Up', 'W'], ['p1Fire', 'F'], ['p2Right', '→'], ['p2Gas', '↑'], ['p2Fire', '/']] as const) {
    await expect(page.getByTestId(`binding-${action}`)).toContainText(key);
  }
});

test('Attack plays from the private ROMs: the coin starts, the ship moves, turns its gun and fires, the plane turns, speeds up and fires, by keyboard and gamepads; settings and sound', { tag: '@game-attack' }, async ({ page }, testInfo) => {
  test.skip(!privateDir, 'Private original ROM fixture directory is unavailable; gameplay not exercised.');
  test.setTimeout(900_000);
  await installGamepads(page, 2);
  const cold = await launchWithRom(page);
  expect(cold.gameOptions).toEqual({ playtimeOhms: 2500000 });
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  expect(cold.nativeRunning).toBe(false);

  await holdClock(page, true);
  await stepClock(page, 500_000);
  expect((await state(page)).nativeRunning, 'No game before a coin').toBe(false);
  await coin(page);
  const playing = await stepUntil(page, (value) => value.nativeRunning, 200_000);
  expect(playing.nativeRunning, 'The coin starts the game (no Start button)').toBe(true);
  expect(playing.playerScores).toEqual([0, 0]);
  const started = BigInt(playing.timePs);
  await stepClock(page, 500_000);

  const directions = async () => (await state(page)).inputs.directions;
  const hold = async (key: string, microseconds: number) => {
    await page.keyboard.down(key); await expect.poll(async () => (await directions()).some(Boolean)).toBe(true);
    await stepClock(page, microseconds);
    await page.keyboard.up(key); await expect.poll(async () => (await directions()).some(Boolean)).toBe(false);
  };
  // Held buttons reach the worker before the clock steps (state().held is
  // ship fire, plane fire, plane faster).
  const held = async () => (await state(page)).held as boolean[];
  const down = async (key: string, index: number) => { await page.keyboard.down(key); await expect.poll(async () => (await held())[index]).toBe(true); };
  const up = async (key: string, index: number) => { await page.keyboard.up(key); await expect.poll(async () => (await held())[index]).toBe(false); };
  // The plane: ↑ held makes it faster; → turns it clockwise and ← counter-
  // clockwise (screen y grows downward, so a clockwise turn has a positive
  // cross product of the velocities before and after).
  const velocity = async (micro = 300_000) => {
    const a = (await objects(page)).plane!; const t0 = BigInt((await state(page)).timePs);
    await stepClock(page, micro);
    const b = (await objects(page)).plane!; const t1 = BigInt((await state(page)).timePs);
    const dt = Number(t1 - t0) / 1e12;
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  };
  const cruise = await velocity();
  await down('ArrowUp', 2); await stepClock(page, 200_000);
  const fast = await velocity();
  await up('ArrowUp', 2); await stepClock(page, 300_000);
  expect(Math.hypot(fast.x, fast.y), '↑ makes the plane faster').toBeGreaterThan(2 * Math.hypot(cruise.x, cruise.y));
  // Turns are measured with the plane held fast, so that its heading shows.
  const cross = (p: Point, q: Point) => p.x * q.y - p.y * q.x;
  await down('ArrowUp', 2); await stepClock(page, 100_000);
  let before = await velocity(100_000);
  await hold('ArrowRight', 250_000);
  let after = await velocity(100_000);
  expect(cross(before, after), `→ turns the plane clockwise: ${JSON.stringify([before, after])}`).toBeGreaterThan(0);
  before = after;
  await hold('ArrowLeft', 250_000);
  after = await velocity(100_000);
  expect(cross(before, after), `← turns the plane counter-clockwise: ${JSON.stringify([before, after])}`).toBeLessThan(0);
  await up('ArrowUp', 2); await stepClock(page, 300_000);

  // The plane fires with /, and controller 2's A makes it faster.
  const bulletsBefore = (await objects(page)).bullets.length;
  await down('Slash', 1); await stepClock(page, 50_000); await up('Slash', 1);
  await stepClock(page, 100_000);
  expect((await objects(page)).bullets.length, '/ fires a plane bullet').toBeGreaterThan(bulletsBefore);
  const padCruise = await velocity();
  await padState(page, 1, { button: [0, true] }); await expect.poll(async () => (await held())[2]).toBe(true);
  await stepClock(page, 200_000);
  const padFast = await velocity();
  await padState(page, 1, { button: [0, false] }); await expect.poll(async () => (await held())[2]).toBe(false);
  expect(Math.hypot(padFast.x, padFast.y), 'Controller 2 A makes the plane faster').toBeGreaterThan(2 * Math.hypot(padCruise.x, padCruise.y));

  // The ship: A moves it left, D right.
  let ship = (await objects(page)).ship!;
  await hold('KeyA', 500_000);
  let moved = (await objects(page)).ship!;
  expect(moved, 'A moves the ship left').toBeLessThan(ship - 30);
  await hold('KeyD', 500_000);
  ship = (await objects(page)).ship!;
  expect(ship, 'D moves the ship right').toBeGreaterThan(moved + 30);

  // The gun: S turns it toward the right, W toward the left, as F's bullet
  // flies (one ship bullet at a time; each shot waits for the last to end).
  const bulletDrift = async () => {
    const plane = (await objects(page)).plane;
    const ours = (list: Point[]) => list.filter((b) => b.y > 200 && (!plane || Math.hypot(b.x - plane.x, b.y - plane.y) > 40));
    await page.getByTestId('game-canvas').focus();
    await down('KeyF', 0); await stepClock(page, 50_000); await up('KeyF', 0);
    await stepClock(page, 100_000);
    const a = ours((await objects(page)).bullets);
    await stepClock(page, 150_000);
    const b = (await objects(page)).bullets.filter((p) => p.y < Math.max(...a.map((q) => q.y)));
    expect(a.length, `A ship bullet rises: ${JSON.stringify(a)}`).toBeGreaterThan(0);
    const start = a.sort((p, q) => q.y - p.y)[0], next = b.sort((p, q) => Math.hypot(p.x - start.x, p.y - start.y) - Math.hypot(q.x - start.x, q.y - start.y))[0];
    await stepClock(page, 1_500_000);
    return next.x - start.x;
  };
  await hold('KeyS', 900_000);
  expect(await bulletDrift(), 'S turns the gun to the right').toBeGreaterThan(8);
  await hold('KeyW', 1_200_000);
  expect(await bulletDrift(), 'W turns the gun to the left').toBeLessThan(-8);

  // Gamepads: controller 1's stick moves the ship, Y fires for both.
  ship = (await objects(page)).ship!;
  await padState(page, 0, { axis: [0, -1] });
  await expect.poll(async () => (await directions()).some(Boolean)).toBe(true);
  await stepClock(page, 400_000);
  await padState(page, 0, { axis: [0, 0] });
  await expect.poll(async () => (await directions()).some(Boolean)).toBe(false);
  expect((await objects(page)).ship!, 'Controller 1 moves the ship').toBeLessThan(ship - 20);
  for (const pad of [0, 1]) {
    const count = (await objects(page)).bullets.length;
    await padState(page, pad, { button: [3, true] }); await expect.poll(async () => (await held())[pad]).toBe(true); await stepClock(page, 50_000);
    await padState(page, pad, { button: [3, false] }); await expect.poll(async () => (await held())[pad]).toBe(false); await stepClock(page, 100_000);
    expect((await objects(page)).bullets.length, `Controller ${pad + 1} Y fires`).toBeGreaterThan(count);
    await stepClock(page, 1_500_000);
  }
  expect((await state(page)).audio.generatedSamples, 'The game has sound').toBeGreaterThan(10_000);

  // A coin during play neither restarts nor clears.
  const scores = (await state(page)).playerScores;
  await coin(page);
  await stepClock(page, 300_000);
  const still = await state(page);
  expect(still.nativeRunning).toBe(true);
  expect(still.playerScores, 'A coin in play does not clear the scores').toEqual(scores);

  // Real-time speed is measured and reported, never gated (docs/TESTING.md).
  const wallNow = () => page.evaluate(() => performance.now());
  const wall = await wallNow();
  await stepClock(page, 2_000_000);
  const rawSpeedRatio = 2 / ((await wallNow() - wall) / 1000);
  testInfo.annotations.push({ type: 'performance', description: `rawSpeedRatio=${rawSpeedRatio.toFixed(3)}` });
  // The game ends ln 3 (R + 330) 33 uF = 90.65 s after the coin.
  await stepClock(page, 90_200_000 - Number((BigInt((await state(page)).timePs) - started) / 1_000_000n));
  expect((await state(page)).nativeRunning, 'Still in play shortly before 90.65 s').toBe(true);
  const ended = await stepUntil(page, (value) => !value.nativeRunning, 1_000_000, 50_000);
  expect(ended.nativeRunning, 'The play timer ends the game').toBe(false);
  await holdClock(page, false);

  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Attack: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('there is no Start button');
  for (const [label, keys] of [['Ship fire', ['F']], ['Plane faster', ['↑']], ['Insert coin and start', ['Enter']]] as const) {
    await expect(help.locator('dl.controls-help > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText([...keys]);
  }
  await page.getByTestId('back').click();

  // Settings: the shortest play time, applied with a cold reset: 36.3 s.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ playtimeOhms: 1000000 });
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
  await holdClock(page, true);
  await stepClock(page, 500_000);
  await coin(page);
  const second = await stepUntil(page, (value) => value.nativeRunning, 200_000);
  expect(second.nativeRunning).toBe(true);
  await stepClock(page, 35_800_000 - Number((BigInt((await state(page)).timePs) - BigInt(second.timePs)) / 1_000_000n));
  expect((await state(page)).nativeRunning, 'Still in play shortly before 36.3 s').toBe(true);
  const short = await stepUntil(page, (value) => !value.nativeRunning, 1_000_000, 50_000);
  expect(short.nativeRunning, 'The shortest play time ends the game').toBe(false);
  await holdClock(page, false);
});
