// SPDX-License-Identifier: GPL-3.0-or-later
// TV Basketball in a desktop browser: Play entry, original coin/Start switches
// and credits (one coin a two-player game, two coins a four-player game), four
// vertical paddles by keyboard, mouse and gamepads, the play-time setting,
// help and sound. Circuit behavior is asserted in simulated time; the
// original/native/Wasm comparison (tools/compare-games.py) is the accuracy
// gate, not this spec.
import { test, expect, type Page } from '@playwright/test';
import { installAudioProbe } from './helpers';
import { installGamepads, padState, screen, titleSettings } from './app-helpers';
import { holdClock, launch, presented, state, stepUntil } from './game-helpers';
import { tvbasketball } from '../../web/src/games/tvbasketball';

// Column bands of the four players on the original raster
// (tools/reference/games/tvbasketball.py); a player's top row runs from 84
// (axis -32768) to 313 (axis 32767).
const BANDS = { stripedLeft: [101, 124], solidLeft: [225, 248], stripedRight: [323, 346], solidRight: [446, 470] } as const;
type Tops = Record<keyof typeof BANDS, number | null>;
// A striped player's first lit row depends on its stripes, so ends are ranges.
const atTop = (top: number | null) => top !== null && top >= 84 && top <= 88;
const atBottom = (top: number | null) => top !== null && top >= 311 && top <= 316;
/** Advance the held clock in quarter-second slices: TV Basketball steps well
 * below real time in some engines, and each debug step must answer within 5 s. */
async function stepClock(page: Page, microseconds: number): Promise<void> {
  for (let remaining = microseconds; remaining > 0; remaining -= 250_000) {
    await page.evaluate((step) => (window as any).__nocpuDebug.stepClock(step), Math.min(250_000, remaining));
  }
}
const paddles = (s: any) => [s.inputs.paddle1, s.inputs.paddle2, s.inputs.paddle3, s.inputs.paddle4];

/** Top row of each player on the presented canvas (a 44..52-row lit run in its band). */
async function tops(page: Page): Promise<Tops> {
  return page.getByTestId('game-canvas').evaluate((element, bands) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const result: Record<string, number | null> = {};
    for (const [name, [left, right]] of Object.entries(bands)) {
      const data = context.getImageData(left, 75, right - left + 1, 291).data;
      const lit = Array.from({ length: 291 }, (_, row) => {
        for (let x = 0; x <= right - left; x += 1) if (data[(row * (right - left + 1) + x) * 4] > 200) return true;
        return false;
      });
      const runs: [number, number][] = [];
      let start = -1, gap = 0;
      for (let row = 0; row < lit.length + 6; row += 1) {
        if (row < lit.length && lit[row]) { if (start < 0) start = row; gap = 0; }
        else if (start >= 0 && ++gap > 4) { runs.push([75 + start, 75 + row - gap]); start = -1; gap = 0; }
      }
      const players = runs.filter(([a, b]) => b - a >= 44 && b - a <= 52);
      result[name] = players.length === 1 ? players[0][0] : null;
    }
    return result;
  }, BANDS) as Promise<Tops>;
}

async function coin(page: Page): Promise<void> {
  const base = (await state(page)).switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  await stepUntil(page, (value) => value.switches.coinCompleted[0] === base + 1, 1_000_000);
  // The coin 555 (3B) holds for about half a second; the credit follows it.
  await stepClock(page, 700_000);
}
async function start(page: Page): Promise<any> {
  const base = (await state(page)).switches.startCompleted[0];
  await page.getByTestId('start-game').click();
  return stepUntil(page, (value) => value.switches.startCompleted[0] === base + 1, 1_000_000);
}
async function hold(page: Page, key: string, microseconds: number): Promise<void> {
  await page.keyboard.down(key);
  await stepClock(page, microseconds);
  await page.keyboard.up(key);
}
/** Player tops once the ball is clear of every band (the players hold still). */
async function shown(page: Page): Promise<Tops> {
  let read: Tops;
  let attempts = 0;
  do {
    await stepClock(page, 100_000);
    await presented(page, await state(page));
    read = await tops(page);
  } while (Object.values(read).includes(null) && ++attempts < 10);
  return read;
}

test('TV Basketball plays from Play: credits, a two-player game by keyboard, mouse and gamepads, and circuit sound', { tag: '@game-tvbasketball' }, async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await installAudioProbe(page);
  await installGamepads(page, 4);
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await expect(page.locator('.play-list').getByTestId('game-tvbasketball')).toBeVisible();
  await page.getByTestId('game-tvbasketball').focus();
  await expect(page.getByTestId('play-detail-name')).toHaveText('TV Basketball');
  await expect(page.getByTestId('play-detail-rom')).toHaveText('No ROM needed');
  await expect(page.getByTestId('play-preview')).toHaveText('Play');
  if (tvbasketball.verified) await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  else await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  const cold = await launch(page, 'tvbasketball');
  expect(cold.gameOptions).toEqual({ playtimeOhms: 35000 });
  expect(paddles(cold)).toEqual([0, 0, 0, 0]);
  expect(cold.nativeRunning).toBe(false);
  expect(cold.playerScores).toEqual([0, 0]);
  expect(cold.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  await expect(page.getByTestId('start-game')).toBeVisible();
  await expect(page.getByTestId('start-game-2')).toBeHidden();

  // Start needs a credit; a coin alone does not start; one coin and Start
  // begin a two-player game. Held clock: exact.
  await holdClock(page, true);
  await start(page);
  await stepClock(page, 500_000);
  expect((await state(page)).nativeRunning, 'Start without a credit does not start a game').toBe(false);
  await coin(page);
  expect((await state(page)).nativeRunning, 'A coin alone does not start a game').toBe(false);
  await start(page);
  let s = await stepUntil(page, (value) => value.nativeRunning, 500_000);
  expect(s.nativeRunning, 'Coin then Start begin play').toBe(true);

  // Keyboard: each pair moves its own axis at the shared full-range rate. In a
  // two-player game W/S moves both striped players, the arrows both solid
  // players, and I/K and T/G move nobody.
  await page.getByTestId('game-canvas').focus();
  const before = await shown(page);
  await hold(page, 'KeyW', 1_100_000);
  s = await state(page);
  expect(paddles(s)).toEqual([-32768, 0, 0, 0]);
  let now = await shown(page);
  expect([now.stripedLeft, now.stripedRight].every(atTop), `W raises both striped players to the top: ${JSON.stringify(now)}`).toBe(true);
  expect([now.solidLeft, now.solidRight], 'W leaves the solid players').toEqual([before.solidLeft, before.solidRight]);
  await hold(page, 'ArrowDown', 1_100_000);
  now = await shown(page);
  expect(paddles(await state(page)).slice(0, 2)).toEqual([-32768, 32767]);
  expect([now.solidLeft, now.solidRight].every(atBottom), `Down lowers both solid players to the bottom: ${JSON.stringify(now)}`).toBe(true);
  for (const key of ['KeyK', 'KeyT']) await hold(page, key, 1_100_000);
  expect(paddles(await state(page))).toEqual([-32768, 32767, 32767, -32768]);
  const idle = await shown(page);
  expect(idle, 'Paddles 3 and 4 move nobody in a two-player game').toEqual(now);
  // The clock runs and the ball scores without help; scores count by two.
  await stepClock(page, 1_000_000);
  s = await state(page);
  expect(s.nativeRunning).toBe(true);
  expect(s.playerScores.every((value: number) => value % 2 === 0)).toBe(true);
  // Real-time speed is measured and reported, never gated (docs/TESTING.md).
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
    evidenceScope: 'TV Basketball in play in a headless desktop browser on this host; reported, not gated, and not a performance qualification.' };
  await testInfo.attach('tvbasketball-performance.json', { body: Buffer.from(JSON.stringify(performanceMetrics, null, 2)), contentType: 'application/json' });
  testInfo.annotations.push({ type: 'performance', description: `simulationSpeedRatio=${performanceMetrics.simulationSpeedRatio.toFixed(3)} rawSpeedRatio=${rawSpeedRatio.toFixed(3)}` });

  // Mouse: the default mouse player is the left striped player, vertically across its range.
  const raster = (await page.getByTestId('game-canvas').boundingBox())!;
  const x = raster.x + raster.width / 2;
  await page.mouse.move(x, raster.y + raster.height / 2);
  await page.mouse.move(x, raster.y + raster.height - 2);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(32767);
  await page.mouse.move(x, raster.y + 2);
  await expect.poll(async () => (await state(page)).inputs.paddle1).toBe(-32768);
  expect(paddles(await state(page)).slice(1), 'The mouse moves only its chosen player').toEqual([32767, 32767, -32768]);
  // Gamepads 2..4: the vertical axis of each.
  await padState(page, 1, { axis: [1, -1] });
  await expect.poll(async () => (await state(page)).inputs.paddle2).toBe(-32768);
  await padState(page, 2, { axis: [1, -1] });
  await expect.poll(async () => (await state(page)).inputs.paddle3).toBe(-32768);
  await padState(page, 3, { axis: [1, 1] });
  await expect.poll(async () => (await state(page)).inputs.paddle4).toBe(32767);
  for (const pad of [1, 2, 3]) await padState(page, pad, { axis: [1, 0] });

  // The circuit generates its own sound; the browser schedules it.
  const playing = await state(page);
  expect(playing.audio.generatedSamples).toBeGreaterThan(cold.audio.generatedSamples);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('tvbasketball-play.png') });

  // How to play names the four players' original controls.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#help-heading')).toHaveText('TV Basketball: How to play');
  const help = page.locator('#game-help-content');
  await expect(help).toContainText('two coins for a four-player game');
  await expect(help).toContainText('after about 119 seconds');
  for (const [label, key] of [['Left striped player up', 'W'], ['Left striped player down', 'S'], ['Right solid player up', '↑'], ['Right solid player down', '↓'],
    ['Right striped player up', 'I'], ['Right striped player down', 'K'], ['Left solid player up', 'T'], ['Left solid player down', 'G'], ['Insert coin', 'Enter'], ['Start game', '1']]) {
    await expect(help.locator('div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd')).toHaveText(key);
  }
  await expect(page.getByTestId('mouse-help')).toContainText('up or down');
  await testInfo.attach('tvbasketball-browser.json', { body: Buffer.from(JSON.stringify({ cold, playing, performanceMetrics }, null, 2)), contentType: 'application/json' });
});

test('TV Basketball two coins are a four-player game; the play-time setting reaches the original potentiometer and the clock ends the game', { tag: '@game-tvbasketball' }, async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('./?debug');
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('tvbasketball');
  await expect(page.getByTestId('playtime')).toHaveValue('50');
  await expect(page.getByTestId('binding-p3Up')).toHaveText('I');
  await expect(page.getByTestId('mouse-slot')).toHaveValue('0');
  // 0% is the 10 kOhm end: 120 periods of ln 2 x 40 kOhm x 22 uF, about 73 s.
  await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
  await expect(page.getByTestId('playtime-value')).toHaveText('0%');
  await page.reload();
  await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('tvbasketball');
  await expect(page.getByTestId('playtime')).toHaveValue('0');
  const cold = await launch(page, 'tvbasketball');
  expect(cold.gameOptions).toEqual({ playtimeOhms: 10000 });
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('after about 73 seconds');
  await page.getByTestId('back').click();
  await page.getByTestId('resume').click();

  await holdClock(page, true);
  await coin(page);
  await coin(page);
  await start(page);
  const started = await stepUntil(page, (value) => value.nativeRunning, 500_000);
  expect(started.nativeRunning, 'Two coins then Start begin play').toBe(true);
  const begin = BigInt(started.timePs);
  // Four players: each key pair moves only its own player.
  await page.getByTestId('game-canvas').focus();
  const base = await shown(page);
  const moves = [['KeyW', 'stripedLeft', atTop], ['ArrowDown', 'solidRight', atBottom], ['KeyI', 'stripedRight', atTop], ['KeyG', 'solidLeft', atBottom]] as const;
  let previous: Tops = base;
  for (const [key, player, end] of moves) {
    await hold(page, key, 1_100_000);
    const moved = await shown(page);
    expect(end(moved[player]), `${key} moves the ${player} player to its end: ${JSON.stringify(moved)}`).toBe(true);
    for (const other of Object.keys(BANDS) as (keyof Tops)[]) if (other !== player) expect(moved[other], `${key} leaves the ${other} player`).toBe(previous[other]);
    previous = moved;
  }
  // The clock ends the game 118 to 120 periods (0.61 s each) after Start:
  // still in play at 71 simulated seconds, over by 73.5.
  await stepClock(page, 71_000_000 - Number((BigInt((await state(page)).timePs) - begin) / 1_000_000n));
  const late = await state(page);
  expect(late.nativeRunning, 'Still in play 71 simulated seconds after Start').toBe(true);
  const ended = await stepUntil(page, (value) => !value.nativeRunning, 2_500_000, 50_000);
  expect(ended.nativeRunning, 'The clock ends the game by 73.5 simulated seconds').toBe(false);
  // Start without a credit does not restart; a coin clears the scores and Start plays again.
  await start(page);
  await stepClock(page, 500_000);
  expect((await state(page)).nativeRunning).toBe(false);
  await coin(page);
  expect((await state(page)).playerScores).toEqual([0, 0]);
  await start(page);
  expect((await stepUntil(page, (value) => value.nativeRunning, 500_000)).nativeRunning).toBe(true);
  await holdClock(page, false);

  // Apply & reset with a changed setting restarts the circuit cold with it.
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('playtime').focus(); await page.keyboard.press('End'); await page.getByTestId('playtime').dispatchEvent('change');
  await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await state(page)).gameOptions).toEqual({ playtimeOhms: 60000 });
  const reset = await state(page);
  expect(reset.identity.resetId).toBeGreaterThan(cold.identity.resetId);
  expect(reset.nativeRunning).toBe(false);
});

test('TV Basketball appears as a playable game on phone-sized Play screens (layout only)', { tag: '@game-tvbasketball' }, async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    const row = page.locator('.play-list').getByTestId('game-tvbasketball');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height + 0.001, 'The TV Basketball row is at least 44px tall').toBeGreaterThanOrEqual(44);
    await row.focus();
    await expect(page.getByTestId('play-preview')).toHaveText('Play');
    await expect(page.getByTestId('play-preview')).toBeInViewport();
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, 'Play must not scroll sideways').toBeLessThanOrEqual(card.client + 1);
  }
});
