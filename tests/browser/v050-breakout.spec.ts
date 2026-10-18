// SPDX-License-Identifier: GPL-3.0-or-later
// Software/browser evidence only. Synthetic platform pads and display signals
// are labelled explicitly; no physical installation, speaker or controller claim.
import { test, expect, type Page } from '@playwright/test';
import { installAudioProbe, expectViewportShell } from './helpers';
import { installGamepads, padState } from './app-helpers';
import { holdClock, presented, state, stepClock } from './game-helpers';
import { breakoutSnapshot, breakoutAdvance, breakoutPause, launchBreakout, startBreakout,
  breakoutRaster, visibleBreakoutRaster, breakoutBall, expectBreakoutGeometry } from './v050-breakout-helpers';

test.beforeEach(async ({ page }) => {
  await installAudioProbe(page);
  await page.addInitScript(() => {
    const target = window as any, original = Worker.prototype.postMessage;
    target.__breakoutCommands = [];
    Worker.prototype.postMessage = function (message: any, ...args: any[]) {
      target.__breakoutCommands.push(structuredClone(message));
      return Reflect.apply(original, this, [message, ...args]);
    };
  });
});
async function commands(page: Page, type: string): Promise<any[]> {
  return page.evaluate((type) => (window as any).__breakoutCommands.filter((c: any) => c.type === type), type);
}
async function settings(page: Page): Promise<void> {
  await breakoutPause(page); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('settings-game').selectOption('breakout');
}
async function resumeSettings(page: Page): Promise<void> {
  await page.getByTestId('back').click(); await page.getByTestId('resume').click();
}
async function serveKeyboard(page: Page): Promise<void> {
  await page.keyboard.down('KeyS'); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
  await breakoutAdvance(page, 150000); await page.keyboard.up('KeyS');
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
}

test('Breakout retains original colored portrait frames, shared paddle, explicit Coin/Start/Serve and generated native media', { tag: '@game-breakout' }, async ({ page }, testInfo) => {
  await launchBreakout(page); const cold = await breakoutSnapshot(page);
  expect(cold.options).toEqual({ bonusCredit: 300, cabinet: 'normal', coinage: 1, balls: 3 });
  expect(cold.display).toEqual({ width: 324, height: 432, pixelFormat: 'rgba8888' });
  expect(cold.axes).toEqual([0]); expect(cold.directions).toEqual([0]); expect(cold.run).toBe(false); expect(cold.attract).toBe(true);
  expect(cold.hits).toBeNull(); expect(cold.raw).not.toBeNull();
  const starts = (await commands(page, 'start')).length;
  await page.getByTestId('insert-coin').click(); await breakoutAdvance(page, 250000);
  expect((await commands(page, 'start')).length).toBe(starts); expect((await breakoutSnapshot(page)).run).toBe(false);
  expect((await commands(page, 'serve')).some((c) => c.held)).toBe(false);
  // Start, Serve and the ball run on the held clock with the calibrated
  // replays' timing (Serve 400 ms after the Start pulse, held 100 ms), and the
  // ball is looked for in one presented frame per 10 ms of circuit time. On
  // the free-running clock a slow host pressed Serve late, after the circuit
  // had stopped taking it, or looked only after the ball had left the court
  // (WebKit: no ball, or ball 2 up and none visible).
  await holdClock(page, true);
  await page.getByTestId('start-game').click();
  await expect.poll(async () => (await commands(page, 'start')).length).toBe(starts + 1);
  for (let elapsed = 0; elapsed < 1_000_000 && !(await breakoutSnapshot(page)).run; elapsed += 10_000) await stepClock(page, 10_000);
  expect((await breakoutSnapshot(page)).run).toBe(true);
  expect((await commands(page, 'start')).at(-1)).toMatchObject({ type: 'start', player: 1 });
  expect((await commands(page, 'serve')).some((c) => c.held)).toBe(false);
  await stepClock(page, 400_000);
  await page.keyboard.down('KeyS'); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
  await stepClock(page, 100_000); await page.keyboard.up('KeyS');
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
  await presented(page, await state(page));
  const raster = await visibleBreakoutRaster(page), active = await breakoutSnapshot(page);
  expect(raster.colors).toEqual(expect.arrayContaining(['204,204,204', '163,30,10', '194,133,10', '10,133,51', '194,194,41', '10,133,194']));
  const ballAt = async (): Promise<Awaited<ReturnType<typeof breakoutBall>> | undefined> => {
    await presented(page, await state(page));
    try { return await breakoutBall(page); } catch { return undefined; }
  };
  let firstBall = await ballAt();
  for (let elapsed = 0; !firstBall && elapsed < 2_000_000; elapsed += 10_000) { await stepClock(page, 10_000); firstBall = await ballAt(); }
  expect(firstBall, 'the served ball appears within 2 simulated seconds').toBeDefined();
  const firstState = await breakoutSnapshot(page);
  let movedBall: Awaited<ReturnType<typeof breakoutBall>> | undefined;
  for (let elapsed = 0; elapsed < 250_000; elapsed += 10_000) {
    await stepClock(page, 10_000); movedBall = await ballAt();
    if (movedBall && Math.hypot(movedBall.x - firstBall!.x, movedBall.y - firstBall!.y) > 5) break;
  }
  expect(movedBall, 'the ball is still in play after it moves').toBeDefined();
  expect(Math.hypot(movedBall!.x - firstBall!.x, movedBall!.y - firstBall!.y)).toBeGreaterThan(5);
  await holdClock(page, false);
  const after = await breakoutSnapshot(page);
  expect(after.generation).toBe(firstState.generation); expect(after.resetId).toBe(firstState.resetId); expect(after.run).toBe(true);
  expect(after.frame).toBeGreaterThan(active.frame); expect(after.audio.generatedSamples).toBeGreaterThan(active.audio.generatedSamples);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(0);
  await testInfo.attach('breakout-native-media-software.json', { body: Buffer.from(JSON.stringify({ cold, active, after, raster, firstBall, movedBall,
    nativeRunningSource: 'original ATTRACT_n E6.9, separate from raw creditQ_n', physicalQualification: false, audioScope: 'native PCM and browser scheduling; no speaker claim' }, null, 2)), contentType: 'application/json' });
});

test('Breakout keyboard and mouse move original pixels, preserve full endpoints and release held mouse Serve on focus loss', { tag: '@game-breakout' }, async ({ page }, testInfo) => {
  await launchBreakout(page); await startBreakout(page); const initial = await visibleBreakoutRaster(page);
  await page.keyboard.down('ArrowLeft'); await expect.poll(async () => (await breakoutSnapshot(page)).directions).toEqual([-1]);
  await expect.poll(async () => (await breakoutSnapshot(page)).axes[0]).toBeLessThan(-7000); await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await breakoutSnapshot(page)).directions).toEqual([0]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeLessThan(initial.paddle.x - 20);
  await page.keyboard.down('ArrowRight'); await expect.poll(async () => (await breakoutSnapshot(page)).axes[0]).toBeGreaterThan(7000);
  await page.keyboard.up('ArrowRight'); await expect.poll(async () => (await breakoutSnapshot(page)).directions).toEqual([0]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeGreaterThan(initial.paddle.x + 20);
  const canvas = (await page.getByTestId('game-canvas').boundingBox())!, y = canvas.y + canvas.height * .6;
  const left = Math.ceil(canvas.x + 2), right = Math.floor(canvas.x + canvas.width - 2);
  await page.mouse.move(left, y); await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([-32768]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeLessThan(12);
  await page.mouse.move(right, y); await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([32767]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeGreaterThan(260);
  expect((await breakoutSnapshot(page)).pointerCount).toBe(0);
  // The left mouse button over the display holds the original Serve switch.
  await page.mouse.down(); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
  expect((await breakoutSnapshot(page)).pointerCount).toBe(1);
  await page.mouse.up(); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
  await page.mouse.down(); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
  expect((await breakoutSnapshot(page)).pointerCount).toBe(0); await page.mouse.up();
  // Mouse Off: a held click over the display neither serves nor captures the pointer.
  await settings(page); await page.getByTestId('mouse-slot').selectOption('off'); await resumeSettings(page);
  await expect.poll(async () => (await breakoutSnapshot(page)).paused).toBe(false);
  await page.mouse.move(Math.round(canvas.x + canvas.width / 2), y); await page.mouse.down();
  await breakoutAdvance(page, 100_000);
  expect((await breakoutSnapshot(page)).serve).toBe(false); expect((await breakoutSnapshot(page)).pointerCount).toBe(0);
  await page.mouse.up();
  await testInfo.attach('breakout-horizontal-endpoints.json', { body: Buffer.from(JSON.stringify({ initial, canvas, integerTargets: [left, right], after: await breakoutSnapshot(page) })), contentType: 'application/json' });
});

test('Breakout remapped shared controller and Serve sources retain ownership, neutralize opposition and rearm after menus/disconnect', { tag: '@game-breakout' }, async ({ page }, testInfo) => {
  await installGamepads(page); await launchBreakout(page); await startBreakout(page); await settings(page);
  await page.getByTestId('binding-serve').click(); await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('binding-serve')).toHaveText('Q');
  await page.getByTestId('bind-axis-p1').click(); await padState(page, 1, { axis: [2, -1] });
  await expect(page.getByTestId('gamepad-p1-pad')).toHaveValue('1'); await expect(page.getByTestId('gamepad-p1-axis')).toHaveValue('2'); await padState(page, 1, { axis: [2, 0] });
  await resumeSettings(page); await padState(page, 1, { axis: [2, 0] }); await padState(page, 1, { axis: [2, -1] }); await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([-32768]);
  await padState(page, 1, { axis: [2, 1] }); await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([32767]);
  await padState(page, 1, { axis: [2, 0] });
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowRight'); await expect.poll(async () => (await breakoutSnapshot(page)).directions).toEqual([0]);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('KeyS'); expect((await breakoutSnapshot(page)).serve).toBe(false); await page.keyboard.up('KeyS');
  await padState(page, 0, { button: [3, false] }); await padState(page, 0, { button: [3, true] }); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
  await page.keyboard.down('KeyQ'); await padState(page, 0, { button: [3, false] }); expect((await breakoutSnapshot(page)).serve).toBe(true);
  await page.keyboard.up('KeyQ'); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
  await padState(page, 0, { button: [3, true] }); await breakoutPause(page); expect((await breakoutSnapshot(page)).serve).toBe(false);
  await page.getByTestId('resume').click(); expect((await breakoutSnapshot(page)).serve).toBe(false);
  await padState(page, 0, { button: [3, false] }); await padState(page, 0, { button: [3, true] }); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
  await padState(page, 0, { connected: false }); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
  expect((await breakoutSnapshot(page)).directions).toEqual([0]);
  await breakoutPause(page); await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('Shared paddle: controller 2, axis 3');
  await testInfo.attach('breakout-input-scope.json', { body: Buffer.from(JSON.stringify({ controller: 'synthetic navigator.getGamepads platform fixture', keyboard: 'Playwright browser driver', physicalController: false, after: await breakoutSnapshot(page) })), contentType: 'application/json' });
});

test('Breakout authentic two-credit Start2 and all four DIPs survive reset/relaunch without changing existing game settings', { tag: '@game-breakout' }, async ({ page }, testInfo) => {
  await launchBreakout(page); await expect(page.getByTestId('status')).toContainText('two coins for Start 2P');
  await page.getByTestId('insert-coin').click(); await page.getByTestId('start-game-2').click(); await breakoutAdvance(page, 500000);
  const insufficientCredit = await breakoutSnapshot(page); expect(insufficientCredit.run).toBe(false);
  expect((await commands(page, 'start')).at(-1)).toMatchObject({ player: 2 });
  await breakoutPause(page); await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('Start 2P needs two credits');
  await expect(page.locator('#game-help-content')).toContainText('two coins for Start 2P with the current setting');
  await page.getByTestId('back').click(); await page.getByTestId('reset').click();
  await expect.poll(async () => (await breakoutSnapshot(page)).resetId).toBe(insufficientCredit.resetId + 1); await page.getByTestId('resume').click();
  const coinsBefore = (await commands(page, 'coin')).length; await startBreakout(page, 2);
  expect((await commands(page, 'start')).at(-1)).toMatchObject({ player: 2 });
  expect((await commands(page, 'coin')).length - coinsBefore).toBe(2); expect((await breakoutSnapshot(page)).axes).toHaveLength(1);
  await settings(page); await page.getByTestId('bonus-credit').selectOption('800'); await page.getByTestId('cabinet').selectOption('cocktail');
  await page.getByTestId('coinage').selectOption('2'); await page.getByTestId('balls').selectOption('5');
  const prior = await breakoutSnapshot(page); expect(prior.options).toEqual({ bonusCredit: 300, cabinet: 'normal', coinage: 1, balls: 3 });
  await expect(page.getByTestId('game-options-status')).toContainText('reset'); await page.getByTestId('apply-game-options').click();
  const expected = { bonusCredit: 800, cabinet: 'cocktail', coinage: 2, balls: 5 };
  await expect.poll(async () => (await breakoutSnapshot(page)).options).toEqual(expected);
  const reset = await breakoutSnapshot(page); expect(reset.resetId).toBe(prior.resetId + 1); expect(reset.generation).toBe(prior.generation);
  expect(reset.axes).toEqual([0]); expect(reset.serve).toBe(false); expect(reset.start).toBe(false); expect(reset.startsQueued).toBe(0);
  expect(reset.paused).toBe(true); expect(reset.run).toBe(false);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!)); expect(saved.version).toBe(6);
  expect(saved.preferences.optionsByGame.breakout).toEqual(expected); expect(saved.preferences.optionsByGame.pong).toEqual({ winningScore: 11 });
  await resumeSettings(page); await expect(page.getByTestId('status')).toContainText('coin for two credits');
  const nextCoinCount = (await commands(page, 'coin')).length;
  await page.getByTestId('insert-coin').click(); await page.getByTestId('start-game-2').click();
  await expect.poll(async () => (await breakoutSnapshot(page)).run).toBe(true); expect((await commands(page, 'coin')).length - nextCoinCount).toBe(1);
  await page.reload(); await page.getByTestId('open-library').click(); await page.getByTestId('game-breakout').click(); await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 }); await expect.poll(async () => (await breakoutSnapshot(page)).options).toEqual(expected);
  await testInfo.attach('breakout-dip-reset.json', { body: Buffer.from(JSON.stringify({ insufficientCredit, prior, reset, relaunched: await breakoutSnapshot(page), settingsScope: 'actual one/two-credit Start2 plus descriptor options/readback; no inferred lives/current-player semantics' }, null, 2)), contentType: 'application/json' });
});

test('version-2 settings preserve literal custom three-game mappings and private sound choices while Breakout gets independent defaults', async ({ page }) => {
  // Literal version-2 data is independent of the current product's defaults
  // and its Vite-only JSON imports. New Breakout actions are deliberately absent.
  const legacy = { volume: .23, muted: true, bindings: {
    keyboard: { p1Up: ['KeyQ'], p1Down: ['KeyS'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], coin: ['KeyC'], menu: ['Space'], reset: ['KeyR'], mute: ['KeyM'], p3Up: [], p3Down: [], p4Up: [], p4Down: [], start: [] },
    gamepad: { players: [{ pad: 2, axis: 3, invert: true, deadzone: .27 }, { pad: 1, axis: 1, invert: false, deadzone: .15 }],
      buttons: { p1Up: [{ pad: 0, button: 12 }], p1Down: [{ pad: 0, button: 13 }], p2Up: [{ pad: 1, button: 12 }], p2Down: [{ pad: 1, button: 13 }], coin: [{ pad: 0, button: 0 }, { pad: 1, button: 0 }], menu: [{ pad: 0, button: 9 }, { pad: 1, button: 9 }], reset: [], mute: [], p3Up: [], p3Down: [], p4Up: [], p4Down: [], start: [] } },
  }, bindingsByGame: { pongdoubles: {
    keyboard: { p1Up: ['KeyW'], p1Down: ['KeyS'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], coin: ['Enter'], menu: ['Space'], reset: ['KeyR'], mute: ['KeyM'], p3Up: ['KeyY'], p3Down: ['KeyG'], p4Up: ['KeyI'], p4Down: ['KeyK'], start: ['Digit1'] },
    gamepad: { players: [{ pad: 0, axis: 1, invert: false, deadzone: .15 }, { pad: 1, axis: 1, invert: false, deadzone: .15 }, { pad: 2, axis: 1, invert: false, deadzone: .15 }, { pad: 3, axis: 1, invert: false, deadzone: .15 }],
      buttons: { p1Up: [{ pad: 0, button: 12 }], p1Down: [{ pad: 0, button: 13 }], p2Up: [{ pad: 1, button: 12 }], p2Down: [{ pad: 1, button: 13 }], coin: [{ pad: 0, button: 0 }, { pad: 1, button: 0 }, { pad: 2, button: 0 }, { pad: 3, button: 0 }], menu: [{ pad: 0, button: 9 }, { pad: 1, button: 9 }, { pad: 2, button: 9 }, { pad: 3, button: 9 }], reset: [], mute: [], p3Up: [{ pad: 2, button: 12 }], p3Down: [{ pad: 2, button: 13 }], p4Up: [{ pad: 3, button: 12 }], p4Down: [{ pad: 3, button: 13 }], start: [{ pad: 0, button: 1 }, { pad: 1, button: 1 }, { pad: 2, button: 1 }, { pad: 3, button: 1 }] } },
  }, spacerace: {
    keyboard: { p1Up: ['KeyE'], p1Down: ['KeyS'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], coin: ['Enter'], menu: ['Space'], reset: ['KeyR'], mute: ['KeyM'], p3Up: [], p3Down: [], p4Up: [], p4Down: [], start: ['Digit1'] },
    gamepad: { players: [{ pad: 0, axis: 1, invert: false, deadzone: .15 }, { pad: 1, axis: 1, invert: false, deadzone: .15 }],
      buttons: { p1Up: [{ pad: 0, button: 12 }], p1Down: [{ pad: 0, button: 13 }], p2Up: [{ pad: 1, button: 12 }], p2Down: [{ pad: 1, button: 13 }], coin: [{ pad: 0, button: 0 }, { pad: 1, button: 0 }], menu: [{ pad: 0, button: 9 }, { pad: 1, button: 9 }], reset: [], mute: [], p3Up: [], p3Down: [], p4Up: [], p4Down: [], start: [{ pad: 0, button: 1 }, { pad: 1, button: 1 }] } },
  } },
    optionsByGame: { pong: { winningScore: 15 }, pongdoubles: { winningScore: 15 }, spacerace: { coinage: 2, playtimeOhms: 1130000 } } };
  await page.addInitScript((legacy) => { if (!localStorage.getItem('nocpu.preferences')) localStorage.setItem('nocpu.preferences', JSON.stringify({ version: 2, preferences: legacy })); }, legacy);
  await launchBreakout(page); await settings(page); await expect(page.getByTestId('preferences-status')).toContainText('kept');
  await expect(page.getByTestId('binding-p1Left')).toHaveText('←'); await expect(page.getByTestId('binding-serve')).toHaveText('S');
  await page.getByTestId('settings-game').selectOption('pong'); await expect(page.getByTestId('binding-p1Up')).toHaveText('Q'); await expect(page.getByTestId('binding-coin')).toHaveText('C');
  await expect(page.getByTestId('gamepad-p1-pad')).toHaveValue('2'); await expect(page.getByTestId('gamepad-p1-axis')).toHaveValue('3');
  await page.getByTestId('settings-game').selectOption('pongdoubles'); await expect(page.getByTestId('binding-p3Up')).toHaveText('Y');
  await page.getByTestId('settings-game').selectOption('spacerace'); await expect(page.getByTestId('binding-p1Up')).toHaveText('E');
  await expect(page.getByTestId('coinage')).toHaveValue('2'); await expect(page.getByTestId('playtime')).toHaveValue('66');
  await page.locator('#volume').focus(); await page.keyboard.press('ArrowRight'); const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!)); expect(saved.version).toBe(6);
  for (const gameId of ['pong', 'pongdoubles', 'spacerace'] as const) {
    const original = gameId === 'pong' ? legacy.bindings : legacy.bindingsByGame[gameId], restored = gameId === 'pong' ? saved.preferences.bindings : saved.preferences.bindingsByGame[gameId];
    for (const action of Object.keys(original.keyboard)) expect(restored.keyboard[action]).toEqual((original.keyboard as any)[action]);
    expect(restored.gamepad.players).toEqual(original.gamepad.players); expect(saved.preferences.optionsByGame[gameId]).toEqual(legacy.optionsByGame[gameId]);
  }
  expect(saved.preferences.muted).toBe(true); expect(saved.preferences.bindingsByGame.breakout.gamepad.players).toHaveLength(1);
});

test('Breakout keeps its whole rotated raster in view with usable actions at desktop window sizes', { tag: '@game-breakout' }, async ({ page }, testInfo) => {
  await launchBreakout(page); await startBreakout(page); const geometry: unknown[] = [];
  for (const size of [{ width: 1024, height: 600 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 800, height: 1000 }]) {
    await page.setViewportSize(size);
    await expectViewportShell(page); geometry.push(await expectBreakoutGeometry(page));
    await page.screenshot({ path: testInfo.outputPath(`breakout-desktop-${size.width}x${size.height}.png`) });
  }
  await testInfo.attach('breakout-desktop-geometry.json', { body: Buffer.from(JSON.stringify(geometry, null, 2)), contentType: 'application/json' });
});

test('Breakout held Serve and paddle contacts pause/reset/dispose cleanly before an unchanged Pong session', { tag: '@game-breakout' }, async ({ page }, testInfo) => {
  await launchBreakout(page); await startBreakout(page); await serveKeyboard(page); await page.keyboard.down('ArrowLeft'); await page.keyboard.down('KeyS');
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true); const before = await breakoutSnapshot(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(async () => (await breakoutSnapshot(page)).paused).toBe(true); const restored = await breakoutSnapshot(page);
  expect(restored.serve).toBe(false); expect(restored.directions).toEqual([0]); expect(restored.heldKeys).toEqual([]); expect(restored.pointerCount).toBe(0);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('KeyS'); await page.waitForTimeout(100); const stable = await breakoutSnapshot(page);
  expect(stable.timeps).toBe(restored.timeps); expect(stable.audio.queueDepth).toBe(0); expect(stable.audio.scheduledSamples).toBe(restored.audio.scheduledSamples);
  await page.getByTestId('reset').click(); await expect.poll(async () => (await breakoutSnapshot(page)).resetId).toBe(before.resetId + 1);
  const reset = await breakoutSnapshot(page); expect(reset.serve).toBe(false); expect(reset.axes).toEqual([0]); expect(reset.startsQueued).toBe(0);
  await page.getByTestId('return-library').click(); expect(await page.evaluate(async () => { try { await (window as any).__nocpuDebug.snapshot(); return false; } catch { return true; } })).toBe(true);
  const scheduled = await page.evaluate(() => (window as any).__audioProbe.started); await page.waitForTimeout(100); expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(scheduled);
  await page.getByTestId('game-pong').click(); await page.getByTestId('play-selected').click(); await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('insert-coin').click(); await expect.poll(async () => (await breakoutSnapshot(page)).run).toBe(true);
  const pong = await page.evaluate(async () => (window as any).__nocpuDebug.snapshot()); expect(pong.gameId).toBe('pong'); expect(pong.inputs.serve).toBe(0); expect(pong.inputs.directions).toEqual([0, 0]);
  expect(pong.identity.generation).toBeGreaterThan(before.generation); expect(pong.display).toEqual({ width: 576, height: 432, pixelFormat: 'rgba8888' });
  await expect(page.getByTestId('start-game-2')).toBeHidden(); await expect(page.getByTestId('start-game')).toBeHidden();
  await testInfo.attach('breakout-restored-reset-disposal.json', { body: Buffer.from(JSON.stringify({ before, restored, reset, pong, lifecycle: 'synthetic pageshow; actual application release/reset/disposal', physicalQualification: false }, null, 2)), contentType: 'application/json' });
});
