// SPDX-License-Identifier: GPL-3.0-or-later
// Gotcha in a desktop browser: Play entry, Coin and Start, two four-way sticks
// (cross and square) by keyboard and gamepads, the play-time setting, the two
// games one coin buys, help and sound. Circuit behavior is asserted in
// simulated time on the held clock; the original/native/Wasm comparison
// (tools/compare-games.py) is the accuracy gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { installAudioProbe } from './helpers';
import { installGamepads, padState, screen, titleSettings } from './app-helpers';
import { holdClock, launch, presented, state, stepClock, stepUntil } from './game-helpers';
import { gotcha } from '../../web/src/games/gotcha';

type Point = [number, number];
type Players = { cross: Point | null; square: Point | null; lit: number };
type Candidates = { cross: Point[]; square: Point[]; lit: number };

/** Cross and square candidates on the presented raster, found as in
 * tools/reference/games/gotcha.py: isolated components seven rows tall below
 * the score digits (row 90 on), the square solid and 6 or 7 pixels wide, the
 * cross sparse and 7 to 9 pixels wide. */
async function candidates(page: Page): Promise<Candidates> {
  return page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const { width, height } = canvas;
    const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const top = 90;
    const lit = new Uint8Array(width * height);
    for (let index = top * width; index < width * height; index += 1) lit[index] = Number(data[index * 4] > 150);
    const seen = new Uint8Array(width * height);
    const result: Candidates = { cross: [], square: [], lit: 0 };
    for (let start = top * width; start < width * height; start += 1) {
      if (!lit[start] || seen[start]) continue;
      seen[start] = 1;
      const stack = [start];
      let area = 0, left = start % width, right = left, upper = Math.floor(start / width), lower = upper;
      while (stack.length) {
        const pixel = stack.pop()!;
        area += 1;
        const x = pixel % width, y = Math.floor(pixel / width);
        left = Math.min(left, x); right = Math.max(right, x); upper = Math.min(upper, y); lower = Math.max(lower, y);
        for (const near of [x ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > top ? pixel - width : -1, y < height - 1 ? pixel + width : -1]) {
          if (near >= 0 && lit[near] && !seen[near]) { seen[near] = 1; stack.push(near); }
        }
      }
      result.lit += area;
      const w = right - left + 1, h = lower - upper + 1;
      const centre: Point = [Math.floor((left + right) / 2), Math.floor((upper + lower) / 2)];
      if (h === 7 && (w === 6 || w === 7) && area === w * h) result.square.push(centre);
      else if (h === 7 && w >= 7 && w <= 9 && area * 10 < w * h * 6) result.cross.push(centre);
    }
    return result;
  });
}
/** The players on the presented raster: with a previous position, the
 * candidate nearest to it (the maze has a few small blocks of similar size). */
let last: Players = { cross: null, square: null, lit: 0 };
async function settled(page: Page): Promise<Players> {
  await presented(page, await state(page));
  const found = await candidates(page);
  const pick = (list: Point[], previous: Point | null): Point | null => {
    if (!previous) return list.length === 1 ? list[0] : null;
    const near = list.filter((point) => Math.abs(point[0] - previous[0]) + Math.abs(point[1] - previous[1]) <= 60);
    near.sort((a, b) => Math.abs(a[0] - previous[0]) + Math.abs(a[1] - previous[1]) - Math.abs(b[0] - previous[0]) - Math.abs(b[1] - previous[1]));
    return near[0] ?? null;
  };
  const current = { cross: pick(found.cross, last.cross), square: pick(found.square, last.square), lit: found.lit };
  // Remember the last place each player was seen, for the next search.
  last = { cross: current.cross ?? last.cross, square: current.square ?? last.square, lit: found.lit };
  return current;
}
async function coin(page: Page): Promise<any> {
  const base = (await state(page)).switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  return stepUntil(page, (value) => value.switches.coinCompleted[0] === base + 1, 1_000_000);
}
async function start(page: Page): Promise<any> {
  const base = (await state(page)).switches.startCompleted[0];
  await page.getByTestId('start-game').click();
  return stepUntil(page, (value) => value.switches.startCompleted[0] === base + 1, 1_000_000);
}
/** Hold one key for `microseconds` of simulated time and return the players after it. */
async function hold(page: Page, key: string, microseconds: number, directions: number[]): Promise<Players> {
  await page.keyboard.down(key);
  await stepClock(page, 20_000);
  expect((await state(page)).inputs.directions, `${key} holds its switch`).toEqual(directions);
  await stepClock(page, microseconds - 20_000);
  await page.keyboard.up(key);
  await stepClock(page, 20_000);
  expect((await state(page)).inputs.directions).toEqual([0, 0, 0, 0]);
  return settled(page);
}

test('Gotcha plays from Play: Coin and Start, the cross and the square on four-way sticks by keyboard and gamepads, and circuit sound', { tag: '@game-gotcha' }, async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  last = { cross: null, square: null, lit: 0 };
  await installAudioProbe(page);
  await installGamepads(page, 2);
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-gotcha')).toBeVisible();
  await page.getByTestId('game-gotcha').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Gotcha');
  await expect(page.getByTestId('play-detail-rom')).toHaveText('No ROM needed');
  await expect(page.getByTestId('play-preview')).toHaveText('Play');
  if (gotcha.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  const cold = await launch(page, 'gotcha');
  expect(cold.gameOptions).toEqual({ playtimeOhms: 297000 });
  expect(cold.nativeRunning).toBe(false);
  expect(cold.attractN).toBe(0);
  expect(cold.playerScores).toEqual([0, 0]);
  expect(cold.inputs.directions).toEqual([0, 0, 0, 0]);
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  await expect(page.getByTestId('start-game')).toBeVisible();
  await expect(page.getByTestId('start-game-2')).toBeHidden();

  // Held clock from 2.0 simulated seconds, so every input below lands at the
  // same circuit time in every run: Start without a credit and a coin alone do
  // not start a game; Start after the coin does, with both counters cleared.
  await holdClock(page, true);
  const launched = BigInt((await state(page)).timePs);
  expect(launched < 2_000_000_000_000n, 'The game was launched within 2 simulated seconds').toBe(true);
  await stepClock(page, Number((2_000_000_000_000n - launched) / 1_000_000n));
  await start(page);
  await stepClock(page, 500_000);
  expect((await state(page)).nativeRunning, 'Start without a credit does not start a game').toBe(false);
  await coin(page);
  await stepClock(page, 400_000);
  expect((await state(page)).nativeRunning, 'A coin alone does not start a game').toBe(false);
  await start(page);
  let s = await stepUntil(page, (value) => value.nativeRunning, 1_000_000);
  expect(s.nativeRunning, 'Start after a coin starts the game within one simulated second').toBe(true);
  expect(s.attractN).toBe(1);
  expect(s.playerScores).toEqual([0, 0]);
  // The catch flash after Start shows the players alone, without the maze;
  // the maze returns when the 0.73 s catch one-shot ends.
  await stepClock(page, 100_000);
  let p = await settled(page);
  expect(p.lit, 'Only the two players are drawn during the catch flash').toBeLessThan(200);
  expect(p.cross && p.square, `both players visible: ${JSON.stringify(p)}`).toBeTruthy();
  await stepClock(page, 800_000);
  p = await settled(page);
  expect(p.lit, 'The maze is back after the flash').toBeGreaterThan(10000);

  // Keyboard: D/A/W/S hold the cross's four switches and move only the cross
  // that way; the arrow keys do the same for the square.
  await page.getByTestId('game-canvas').focus();
  const moves: [string, number[], 'cross' | 'square', 0 | 1, 1 | -1][] = [
    ['KeyD', [0, 1, 0, 0], 'cross', 0, 1], ['KeyA', [0, -1, 0, 0], 'cross', 0, -1],
    ['KeyW', [-1, 0, 0, 0], 'cross', 1, -1], ['KeyS', [1, 0, 0, 0], 'cross', 1, 1],
    ['ArrowRight', [0, 0, 0, 1], 'square', 0, 1], ['ArrowLeft', [0, 0, 0, -1], 'square', 0, -1],
    ['ArrowUp', [0, 0, -1, 0], 'square', 1, -1], ['ArrowDown', [0, 0, 1, 0], 'square', 1, 1],
  ];
  for (const [key, directions, player, axis, sign] of moves) {
    const before = await settled(page);
    const after = await hold(page, key, 200_000, directions);
    const other = player === 'cross' ? 'square' : 'cross';
    expect(before[player] && after[player], `${key}: ${JSON.stringify({ before, after })}`).toBeTruthy();
    expect(sign * (after[player]![axis] - before[player]![axis]), `${key} moves the ${player} ${sign > 0 ? '+' : '-'}${axis ? 'y' : 'x'}`).toBeGreaterThanOrEqual(6);
    // Touching a wall bumps a player back by a pixel or two.
    expect(Math.abs(after[player]![1 - axis] - before[player]![1 - axis]), `${key} keeps the ${player}'s other coordinate: ${JSON.stringify({ before, after })}`).toBeLessThanOrEqual(2);
    expect(after[other], `${key} leaves the ${other} alone`).toEqual(before[other]);
  }

  // Gamepads: controller 2's horizontal axis holds the square's Left switch;
  // controller 1's d-pad Up holds the cross's Up switch.
  let before = await settled(page);
  await padState(page, 1, { axis: [0, -1] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([0, 0, 0, -1]);
  await stepClock(page, 200_000);
  await padState(page, 1, { axis: [0, 0] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([0, 0, 0, 0]);
  let after = await settled(page);
  expect(before.square![0] - after.square![0], `controller 2 moves the square left: ${JSON.stringify({ before, after })}`).toBeGreaterThanOrEqual(6);
  // The changing maze can merge a still player with a wall; when found, it has not moved.
  if (after.cross) expect(after.cross).toEqual(before.cross);
  before = { ...after, square: after.square ?? before.square };
  await padState(page, 0, { button: [12, true] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([-1, 0, 0, 0]);
  await stepClock(page, 200_000);
  await padState(page, 0, { button: [12, false] });
  await expect.poll(async () => (await state(page)).inputs.directions).toEqual([0, 0, 0, 0]);
  after = await settled(page);
  expect(before.cross![1] - after.cross![1], `controller 1's d-pad moves the cross up: ${JSON.stringify({ before, after })}`).toBeGreaterThanOrEqual(6);
  if (after.square) expect(after.square).toEqual(before.square);
  // The play-time counter runs in play (about one count per simulated second).
  await stepClock(page, 1_500_000);
  s = await state(page);
  expect(s.nativeRunning).toBe(true);
  expect(s.playerScores[1], 'The play-time counter counts up').toBeGreaterThanOrEqual(1);
  // Real-time speed is measured and reported, never gated (docs/TESTING.md):
  // raw, how fast the held clock steps three simulated seconds; paced, how
  // much simulated time passes per wall second once the clock runs freely.
  const wallNow = () => page.evaluate(() => performance.now());
  const wall = await wallNow();
  await stepClock(page, 3_000_000);
  const rawSpeedRatio = 3 / ((await wallNow() - wall) / 1000);
  await holdClock(page, false);
  const paced = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  await expect.poll(async () => BigInt((await state(page)).timePs) >= BigInt(paced.state.timePs) + 4_000_000_000_000n, { timeout: 120_000 }).toBe(true);
  const pacedEnd = await page.evaluate(async () => ({ state: await (window as any).__nocpuDebug.snapshot(), wall: performance.now() }));
  const simulationSeconds = Number(BigInt(pacedEnd.state.timePs) - BigInt(paced.state.timePs)) / 1e12;
  const performanceMetrics = { rawSpeedRatio, simulationSeconds, wallSeconds: (pacedEnd.wall - paced.wall) / 1000,
    simulationSpeedRatio: simulationSeconds / ((pacedEnd.wall - paced.wall) / 1000), browser: page.context().browser()?.version(),
    evidenceScope: 'Gotcha in play in a headless desktop browser on this host; reported, not gated, and not a performance qualification.' };
  await testInfo.attach('gotcha-performance.json', { body: Buffer.from(JSON.stringify(performanceMetrics, null, 2)), contentType: 'application/json' });
  testInfo.annotations.push({ type: 'performance', description: `simulationSpeedRatio=${performanceMetrics.simulationSpeedRatio.toFixed(3)} rawSpeedRatio=${rawSpeedRatio.toFixed(3)}` });

  // The circuit generates its own sound (the proximity tone); the browser schedules it.
  const playing = await state(page);
  expect(playing.audio.generatedSamples).toBeGreaterThan(cold.audio.generatedSamples);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('gotcha-play.png') });

  // How to play names both players' original controls; the mouse is not used.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('Gotcha: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('Insert a coin, then press Start.');
  await expect(help).toContainText('after about 105 seconds');
  for (const [label, key] of [['Cross up', 'W'], ['Cross down', 'S'], ['Cross left', 'A'], ['Cross right', 'D'],
    ['Square up', '↑'], ['Square down', '↓'], ['Square left', '←'], ['Square right', '→'], ['Insert coin', 'Enter'], ['Start game', '1']]) {
    await expect(help.locator('div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText(key);
  }
  await testInfo.attach('gotcha-browser.json', { body: Buffer.from(JSON.stringify({ cold, playing }, null, 2)), contentType: 'application/json' });
});

test('Gotcha play time reaches the original potentiometer: one coin buys two timed games, then Start needs a new coin', { tag: '@game-gotcha' }, async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('gotcha');
  // The original default is the potentiometer's maximum, 297 kOhm.
  await expect(page.getByTestId('playtime')).toHaveValue('100');
  await expect(page.getByTestId('binding-p1Left')).toHaveText('A');
  await expect(page.getByTestId('binding-p2Right')).toHaveText('→');
  await expect(page.locator('#mouse-setting')).toContainText('The mouse is not used for this game.');
  // 0% is the 47 kOhm end: ln 3 x 49 kOhm x 5 uF + 99 x ln 2 x 51 kOhm x 5 uF = 17.8 s.
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await expect(page.getByTestId('playtime-value')).toHaveText('0%');
  await page.reload();
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('gotcha');
  await expect(page.getByTestId('playtime')).toHaveValue('0');
  const cold = await launch(page, 'gotcha');
  // The worker only reports options the core accepted.
  expect(cold.gameOptions).toEqual({ playtimeOhms: 47000 });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('after about 18 seconds');
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();

  await holdClock(page, true);
  await coin(page);
  for (const game of [1, 2]) {
    await start(page);
    const started = await stepUntil(page, (value) => value.nativeRunning, 1_000_000);
    expect(started.nativeRunning, `Start begins game ${game}`).toBe(true);
    expect(started.playerScores).toEqual([0, 0]);
    const begin = BigInt(started.timePs);
    // Still in play 17.0 simulated seconds after Start, over by 18.5 s.
    await stepClock(page, 17_000_000 - Number((BigInt((await state(page)).timePs) - begin) / 1_000_000n));
    const late = await state(page);
    expect(late.nativeRunning, `Game ${game} is still in play 17 simulated seconds after Start`).toBe(true);
    expect(late.playerScores[1], 'The play-time counter nears 99').toBeGreaterThanOrEqual(90);
    const ended = await stepUntil(page, (value) => !value.nativeRunning, 1_500_000, 50_000);
    expect(ended.nativeRunning, `The timer ends game ${game} by 18.5 simulated seconds`).toBe(false);
    expect(ended.attractN).toBe(0);
    expect(ended.playerScores[1], 'The play-time counter has passed 99').toBe(0);
    await stepClock(page, 500_000);
  }
  // The coin bought two games: Start now does nothing until a new coin.
  await start(page);
  await stepClock(page, 1_000_000);
  expect((await state(page)).nativeRunning, 'Start after two games needs a new coin').toBe(false);
  await coin(page);
  await start(page);
  const again = await stepUntil(page, (value) => value.nativeRunning, 1_000_000);
  expect(again.nativeRunning).toBe(true);
  expect(again.playerScores).toEqual([0, 0]);
  await holdClock(page, false);

  // Apply & reset with a changed setting restarts the circuit cold with it.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('playtime').focus(); await page.keyboard.press('End'); await page.getByTestId('playtime').dispatchEvent('change');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ playtimeOhms: 297000 });
  const reset = await state(page);
  expect(reset.identity.resetId).toBeGreaterThan(cold.identity.resetId);
  expect(reset.nativeRunning).toBe(false);
});

test('Gotcha appears as a playable game on phone-sized Play screens (layout only)', { tag: '@game-gotcha' }, async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    const row = page.locator('.play-list').getByTestId('game-gotcha');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height + 0.001, 'The Gotcha row is at least 44px tall').toBeGreaterThanOrEqual(44);
    await row.focus();
    await expect(page.getByTestId('play-preview')).toHaveText('Play');
    await expect(page.getByTestId('play-preview')).toBeInViewport();
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, 'Play must not scroll sideways').toBeLessThanOrEqual(card.client + 1);
  }
});
