// SPDX-License-Identifier: GPL-3.0-or-later
// Software/browser evidence only. Synthetic platform pads and display signals
// are labelled explicitly; no physical installation, speaker or controller claim.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installAudioProbe, expectViewportShell } from './helpers';
import { installGamepads, padState } from './app-helpers';
import { breakoutSnapshot, breakoutAdvance, breakoutPause, launchBreakout, startBreakout,
  breakoutRaster, visibleBreakoutRaster, breakoutBall, expectBreakoutGeometry } from './v050-breakout-helpers';

const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
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

test('Breakout retains original colored portrait frames, shared paddle, explicit Coin/Start/Serve and generated native media', async ({ page }, testInfo) => {
  await launchBreakout(page); const cold = await breakoutSnapshot(page);
  expect(cold.options).toEqual({ bonusCredit: 300, cabinet: 'normal', coinage: 1, balls: 3 });
  expect(cold.display).toEqual({ width: 324, height: 432, pixelFormat: 'rgba8888' });
  expect(cold.axes).toEqual([0]); expect(cold.directions).toEqual([0]); expect(cold.run).toBe(false); expect(cold.attract).toBe(true);
  expect(cold.hits).toBeNull(); expect(cold.raw).not.toBeNull();
  const starts = (await commands(page, 'start')).length;
  await page.getByTestId('insert-coin').click(); await breakoutAdvance(page, 250000);
  expect((await commands(page, 'start')).length).toBe(starts); expect((await breakoutSnapshot(page)).run).toBe(false);
  expect((await commands(page, 'serve')).some((c) => c.held)).toBe(false);
  await page.getByTestId('start-game').click(); await expect.poll(async () => (await breakoutSnapshot(page)).run).toBe(true);
  expect((await commands(page, 'start')).at(-1)).toMatchObject({ type: 'start', player: 1 });
  expect((await commands(page, 'serve')).some((c) => c.held)).toBe(false);
  await serveKeyboard(page); const raster = await visibleBreakoutRaster(page), active = await breakoutSnapshot(page);
  expect(raster.colors).toEqual(expect.arrayContaining(['204,204,204', '163,30,10', '194,133,10', '10,133,51', '194,194,41', '10,133,194']));
  let firstBall: Awaited<ReturnType<typeof breakoutBall>> | undefined;
  await expect.poll(async () => { try { firstBall = await breakoutBall(page); return true; } catch { return false; } }, { timeout: 10_000 }).toBe(true);
  const firstState = await breakoutSnapshot(page); await breakoutAdvance(page, 250000);
  let movedBall: Awaited<ReturnType<typeof breakoutBall>> | undefined;
  await expect.poll(async () => {
    try { movedBall = await breakoutBall(page); return Math.hypot(movedBall.x - firstBall!.x, movedBall.y - firstBall!.y) > 5; }
    catch { return false; }
  }, { timeout: 10_000 }).toBe(true);
  const after = await breakoutSnapshot(page);
  expect(after.generation).toBe(firstState.generation); expect(after.resetId).toBe(firstState.resetId); expect(after.run).toBe(true);
  expect(after.frame).toBeGreaterThan(active.frame); expect(after.audio.generatedSamples).toBeGreaterThan(active.audio.generatedSamples);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(0);
  await testInfo.attach('breakout-native-media-software.json', { body: Buffer.from(JSON.stringify({ cold, active, after, raster, firstBall, movedBall,
    nativeRunningSource: 'original ATTRACT_n E6.9, separate from raw creditQ_n', physicalQualification: false, audioScope: 'native PCM and browser scheduling; no speaker claim' }, null, 2)), contentType: 'application/json' });
});

test('Breakout keyboard and external horizontal rail move original pixels, preserve full endpoints and release held Serve on cancel', async ({ page }, testInfo) => {
  await launchBreakout(page); await startBreakout(page); const initial = await visibleBreakoutRaster(page);
  await page.keyboard.down('ArrowLeft'); await expect.poll(async () => (await breakoutSnapshot(page)).directions).toEqual([-1]);
  await expect.poll(async () => (await breakoutSnapshot(page)).axes[0]).toBeLessThan(-7000); await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await breakoutSnapshot(page)).directions).toEqual([0]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeLessThan(initial.paddle.x - 20);
  await page.keyboard.down('ArrowRight'); await expect.poll(async () => (await breakoutSnapshot(page)).axes[0]).toBeGreaterThan(7000);
  await page.keyboard.up('ArrowRight'); await expect.poll(async () => (await breakoutSnapshot(page)).directions).toEqual([0]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeGreaterThan(initial.paddle.x + 20);
  const control = page.getByTestId('paddle-p1'), track = (await control.locator('.control-track').boundingBox())!;
  const target = (await control.boundingBox())!, y = track.y + track.height / 2;
  const left = Math.floor(track.x), right = Math.ceil(track.x + track.width);
  expect(left).toBeGreaterThan(target.x); expect(right).toBeLessThan(target.x + target.width);
  for (const x of [left, right]) expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'), { x, y })).toBe('paddle-p1');
  await page.mouse.move(left, y); await page.mouse.down(); await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([-32768]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeLessThan(12);
  await page.mouse.move(right, y); await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([32767]);
  await expect.poll(async () => (await breakoutRaster(page)).paddle.x).toBeGreaterThan(260); await page.mouse.up();
  await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(0);
  const serve = page.getByTestId('serve-game'); await serve.focus(); await page.keyboard.down('Space');
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true); await page.keyboard.up('Space');
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
  const button = (await serve.boundingBox())!; await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down();
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
  await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));
  await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false); await page.mouse.up();
  await testInfo.attach('breakout-horizontal-endpoints.json', { body: Buffer.from(JSON.stringify({ initial, track, target, integerTargets: [left, right], after: await breakoutSnapshot(page), physicalQualification: false })), contentType: 'application/json' });
});

test('Breakout remapped shared controller and Serve sources retain ownership, neutralize opposition and rearm after menus/disconnect', async ({ page }, testInfo) => {
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

test('Breakout authentic two-credit Start2 and all four DIPs survive reset/relaunch without changing existing game settings', async ({ page }, testInfo) => {
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!)); expect(saved.version).toBe(3);
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
  await page.locator('#volume').focus(); await page.keyboard.press('ArrowRight'); const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!)); expect(saved.version).toBe(3);
  for (const gameId of ['pong', 'pongdoubles', 'spacerace'] as const) {
    const original = gameId === 'pong' ? legacy.bindings : legacy.bindingsByGame[gameId], restored = gameId === 'pong' ? saved.preferences.bindings : saved.preferences.bindingsByGame[gameId];
    for (const action of Object.keys(original.keyboard)) expect(restored.keyboard[action]).toEqual((original.keyboard as any)[action]);
    expect(restored.gamepad.players).toEqual(original.gamepad.players); expect(saved.preferences.optionsByGame[gameId]).toEqual(legacy.optionsByGame[gameId]);
  }
  expect(saved.preferences.muted).toBe(true); expect(saved.preferences.bindingsByGame.breakout.gamepad.players).toHaveLength(1);
});

test('Breakout stays game-first with unobscured horizontal touch and Serve controls in compact portrait/landscape software Home mode', async ({ page }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
  await launchBreakout(page); await startBreakout(page); const geometry: unknown[] = [];
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(size); const safe = size.width < size.height ? { top: 47, right: 0, bottom: 34, left: 0 } : { top: 0, right: 47, bottom: 21, left: 47 };
    await page.evaluate((safe) => { for (const [k, v] of Object.entries(safe)) document.documentElement.style.setProperty(`--safe-${k}`, `${v}px`); }, safe);
    await expectViewportShell(page); geometry.push(await expectBreakoutGeometry(page, safe));
    await expect(page.locator('.game-shell')).toHaveAttribute('data-display-mode', 'standalone');
    await page.screenshot({ path: testInfo.outputPath(`breakout-software-home-${size.width}x${size.height}.png`) });
  }
  await testInfo.attach('breakout-game-first-software-geometry.json', { body: Buffer.from(JSON.stringify({ geometry, syntheticSafeAreas: true, physicalInstallation: false }, null, 2)), contentType: 'application/json' });
});

test('Breakout held Serve and paddle contacts pause/reset/dispose cleanly before an unchanged Pong session', async ({ page }, testInfo) => {
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
  await expect(page.getByTestId('serve-game')).toBeHidden(); await expect(page.getByTestId('start-game-2')).toBeHidden(); await expect(page.getByTestId('paddle-p2')).toBeVisible();
  await testInfo.attach('breakout-restored-reset-disposal.json', { body: Buffer.from(JSON.stringify({ before, restored, reset, pong, lifecycle: 'synthetic pageshow; actual application release/reset/disposal', physicalQualification: false }, null, 2)), contentType: 'application/json' });
});

test('two simultaneous genuine browser touch contacts independently move the Breakout paddle and hold/release Serve', async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'CDP supplies real browser multi-contact routing; installed iPhone hardware remains separate.');
  await page.setViewportSize({ width: 390, height: 844 }); await launchBreakout(page); await startBreakout(page);
  const session = await context.newCDPSession(page); await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const rail = (await page.getByTestId('paddle-p1').locator('.control-track').boundingBox())!, serve = (await page.getByTestId('serve-game').boundingBox())!;
  const first = { id: 11, x: Math.floor(rail.x), y: rail.y + rail.height / 2, radiusX: 6, radiusY: 6 };
  const second = { id: 12, x: serve.x + serve.width / 2, y: serve.y + serve.height / 2, radiusX: 6, radiusY: 6 };
  await page.evaluate(() => {
    (window as any).__breakoutObservedPointers = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, (event) => {
      const pointer = event as PointerEvent;
      (window as any).__breakoutObservedPointers.push({ type, pointerId: pointer.pointerId, pointerType: pointer.pointerType,
        isTrusted: pointer.isTrusted, target: (pointer.target as Element | null)?.closest('[data-testid]')?.getAttribute('data-testid'), x: pointer.clientX, y: pointer.clientY });
    }, { capture: true });
  });
  type PointerObservation = { type: string; pointerId: number; pointerType: string; isTrusted: boolean; target: string | null; x: number; y: number };
  const events = (): Promise<PointerObservation[]> => page.evaluate(() => (window as any).__breakoutObservedPointers);
  const observations: Record<string, unknown>[] = [], dispatches: Record<string, unknown>[] = [];
  const dispatch = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: typeof first[]): Promise<void> => {
    dispatches.push({ type, touchPoints: touchPoints.map((point) => ({ ...point })) });
    await session.send('Input.dispatchTouchEvent', { type, touchPoints });
  };
  const released = (observed: PointerObservation[], id: number): boolean => observed.some((event) => event.pointerId === id && event.isTrusted && event.pointerType === 'touch' && ['pointerup', 'pointercancel'].includes(event.type));
  try {
    await dispatch('touchStart', [first, second]);
    await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(2); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
    await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([-32768]);
    const downs = (await events()).filter((event) => event.type === 'pointerdown');
    expect(downs).toHaveLength(2); expect(downs.every((event) => event.isTrusted && event.pointerType === 'touch')).toBe(true);
    const railPointer = downs.find((event) => event.target === 'paddle-p1')!, servePointer = downs.find((event) => event.target === 'serve-game')!;
    expect(railPointer).toBeDefined(); expect(servePointer).toBeDefined(); expect(railPointer.pointerId).not.toBe(servePointer.pointerId);
    observations.push({ phase: 'both-held', state: await breakoutSnapshot(page) });
    first.x = Math.ceil(rail.x + rail.width); await dispatch('touchMove', [first, second]);
    await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([32767]); expect((await breakoutSnapshot(page)).serve).toBe(true);
    // Pinned Chromium145's default WebTouch path ends the supplied IDs;
    // omitted Move IDs stay held. The alternate SyntheticPointerActions
    // branch described by generic protocol prose is not this launch mode.
    await dispatch('touchEnd', [second]);
    await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false); await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(1);
    await expect.poll(async () => released(await events(), servePointer.pointerId)).toBe(true);
    expect(released(await events(), railPointer.pointerId)).toBe(false);
    observations.push({ phase: 'serve-contact-released', state: await breakoutSnapshot(page) });
    first.x = Math.floor(rail.x); await dispatch('touchMove', [first]);
    await expect.poll(async () => (await breakoutSnapshot(page)).axes).toEqual([-32768]); expect((await breakoutSnapshot(page)).serve).toBe(false);
    expect((await breakoutSnapshot(page)).pointerCount).toBe(1);
    await dispatch('touchCancel', []);
    await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(0); expect((await breakoutSnapshot(page)).directions).toEqual([0]);
    expect((await breakoutSnapshot(page)).serve).toBe(false); await expect.poll(async () => released(await events(), railPointer.pointerId)).toBe(true);
    observations.push({ phase: 'remaining-rail-cancelled', state: await breakoutSnapshot(page) });

    const mirrorBegin = (await events()).length;
    await dispatch('touchStart', [first, second]);
    await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(2); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
    const mirrorDowns = (await events()).slice(mirrorBegin).filter((event) => event.type === 'pointerdown');
    expect(mirrorDowns).toHaveLength(2); expect(mirrorDowns.every((event) => event.isTrusted && event.pointerType === 'touch')).toBe(true);
    expect(mirrorDowns.map((event) => event.target).sort()).toEqual(['paddle-p1', 'serve-game']);
    const mirrorRail = mirrorDowns.find((event) => event.target === 'paddle-p1')!, mirrorServe = mirrorDowns.find((event) => event.target === 'serve-game')!;
    await dispatch('touchEnd', [first]);
    await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(1); expect((await breakoutSnapshot(page)).serve).toBe(true);
    await expect.poll(async () => released((await events()).slice(mirrorBegin), mirrorRail.pointerId)).toBe(true);
    expect(released((await events()).slice(mirrorBegin), mirrorServe.pointerId)).toBe(false);
    second.x = Math.round(second.x) + 2; await dispatch('touchMove', [second]);
    await expect.poll(async () => (await events()).slice(mirrorBegin).some((event) => event.type === 'pointermove' && event.pointerId === mirrorServe.pointerId && event.target === 'serve-game' && event.isTrusted && event.pointerType === 'touch')).toBe(true);
    expect((await breakoutSnapshot(page)).serve).toBe(true); expect((await breakoutSnapshot(page)).pointerCount).toBe(1);
    observations.push({ phase: 'rail-contact-released-serve-still-held', state: await breakoutSnapshot(page) });
    await dispatch('touchEnd', []);
    await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(0); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
    await expect.poll(async () => released((await events()).slice(mirrorBegin), mirrorServe.pointerId)).toBe(true);
    observations.push({ phase: 'remaining-serve-ended', state: await breakoutSnapshot(page) });

    for (const complete of ['touchEnd', 'touchCancel'] as const) {
      const priorEvents = (await events()).length;
      await dispatch('touchStart', [first, second]);
      await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(2); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(true);
      const freshDowns = (await events()).slice(priorEvents).filter((event) => event.type === 'pointerdown');
      expect(freshDowns).toHaveLength(2); expect(freshDowns.every((event) => event.isTrusted && event.pointerType === 'touch')).toBe(true);
      expect(freshDowns.map((event) => event.target).sort()).toEqual(['paddle-p1', 'serve-game']);
      await dispatch(complete, []);
      await expect.poll(async () => (await breakoutSnapshot(page)).pointerCount).toBe(0); await expect.poll(async () => (await breakoutSnapshot(page)).serve).toBe(false);
      expect((await breakoutSnapshot(page)).directions).toEqual([0]);
      await expect.poll(async () => { const observed = (await events()).slice(priorEvents); return freshDowns.every((down) => released(observed, down.pointerId)); }).toBe(true);
      observations.push({ phase: complete === 'touchEnd' ? 'both-ended' : 'both-cancelled', state: await breakoutSnapshot(page) });
    }
  } finally {
    await testInfo.attach('breakout-two-browser-contacts.json', { body: Buffer.from(JSON.stringify({ rail, serve, dispatches, observations,
      pointerEvents: await events(), after: await breakoutSnapshot(page), routing: 'genuine pinned Chromium145 WebTouch CDP events; supplied selective End IDs; software emulated viewport', physicalQualification: false })), contentType: 'application/json' });
    await session.detach();
  }
});

test('Breakout short opt-in reports bind actual native-active title/options and keep raw credit/ball/control state private', async ({ page }, testInfo) => {
  test.skip(process.env.NOCPU_TEST_PACKAGED !== '1', 'Runtime identity reporting requires the actual packaged inventory; development mode is not package qualification.');
  await launchBreakout(page); await startBreakout(page); await serveKeyboard(page); const initial = await breakoutSnapshot(page); await breakoutPause(page);
  await page.getByTestId('menu-qualification').click(); await expect(page.getByTestId('qualification-start')).toBeEnabled(); await page.getByTestId('qualification-start').click();
  await breakoutAdvance(page, 1300000); await breakoutPause(page); await page.getByTestId('menu-qualification').click(); await page.getByTestId('qualification-finish').click();
  await expect(page.getByTestId('qualification-report')).not.toHaveValue(''); const report = JSON.parse(await page.getByTestId('qualification-report').inputValue());
  expect(report.game).toEqual({ id: 'breakout', options: initial.options }); expect(report.game_consistent).toBe(true); expect(report.manifest_start.version).toBe(version);
  expect(report.manifest_start.served_runtime_verified).toBe(true); expect(report.native_run_scope).toContain('ATTRACT_n (E6.9)');
  expect(report.samples.length).toBeGreaterThan(2); expect(report.performance.simulation_seconds).toBeGreaterThan(0); expect(report.release_ready).toBe(false);
  for (const s of report.samples) {
    expect(s.state.gameId).toBe('breakout'); expect(s.state.gameOptions).toEqual(initial.options); expect(s.state.runN).toBe(Number(!s.state.nativeRunning));
    for (const key of ['breakout', 'inputs', 'heldKeys', 'pointerCount', 'display', 'bindings', 'roms']) expect(s.state).not.toHaveProperty(key);
  }
  await testInfo.attach('breakout-short-software-report.json', { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' });
});
