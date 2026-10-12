// SPDX-License-Identifier: GPL-3.0-or-later
// Software profile evidence only; original native comparisons and physical qualification remain separate.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installAudioProbe, expectViewportShell, expectUsableTarget, type Insets } from './helpers';
import { padState, titleSettings } from './app-helpers';
import { activateGame, advanceGame, externalControls, gamePause, gameSettings, gameSnapshot,
  installFourGamepads, launchFromLibrary, resumeFromSettings, waitGameTime, initialGameObjects, renderedGameObjects, sourceCalibratedSpaceMovement } from './v040-game-helpers';

const supported = ['pong', 'pongdoubles', 'spacerace'] as const;
const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();

test('selected circuits have distinct coin/start access, real frame/PCM output and clean cross-game disposal', async ({ page }, testInfo) => {
  await installAudioProbe(page);
  await page.addInitScript(() => {
    const target = window as any; target.__gameCommands = [];
    const native = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...rest: any[]): void {
      if (['init', 'coin', 'start'].includes(message?.type)) target.__gameCommands.push(message);
      Reflect.apply(native, this, [message, ...rest]);
    };
  });
  const evidence: unknown[] = [];
  let previousGeneration = 0;
  for (const [index, gameId] of supported.entries()) {
    await launchFromLibrary(page, gameId, index === 0 ? true : 'library');
    const cold = await gameSnapshot(page);
    expect(cold.gameId).toBe(gameId); expect(cold.generation).toBeGreaterThan(previousGeneration); previousGeneration = cold.generation; expect(cold.axes).toHaveLength(gameId === 'pongdoubles' ? 4 : gameId === 'pong' ? 2 : 0);
    expect(cold.directions).toEqual(Array(gameId === 'pongdoubles' ? 4 : 2).fill(0));
    expect(cold.scores).toEqual([0, 0]);
    // Space's inherited GAME_ON timer is characterized independently; it is
    // not an invented credit-state signal. Coin must still never send Start.
    if (gameId !== 'spacerace') expect(cold.run).toBe(false);
    expect(cold.pointerCount).toBe(0);
    expect(cold.timeps).toMatch(/^\d+$/); expect(BigInt(cold.timeps)).toBeLessThan(3_000_000_000_000n);
    if (gameId === 'pong') await expect(page.getByTestId('start-game')).toBeHidden();
    else {
      await expect(page.getByTestId('start-game')).toBeEnabled();
      const starts = await page.evaluate(() => (window as any).__gameCommands.filter((command: any) => command.type === 'start').length);
      await page.getByTestId('insert-coin').click(); await advanceGame(page, 250000);
      if (gameId === 'pongdoubles') expect((await gameSnapshot(page)).run, 'Original Doubles credit alone does not start play').toBe(false);
      expect(await page.evaluate(() => (window as any).__gameCommands.filter((command: any) => command.type === 'start').length)).toBe(starts);
      // Reset removes this separately tested credit before the actual launch below.
      await gamePause(page); await page.getByTestId('reset').click();
      await expect.poll(async () => (await gameSnapshot(page)).resetId).toBe(cold.resetId + 1);
      await page.getByTestId('resume').click();
    }
    await activateGame(page, gameId); const active = await gameSnapshot(page);
    const samples = await page.evaluate(() => (window as any).__audioProbe.samples);
    await advanceGame(page, 500000);
    await expect.poll(async () => (await gameSnapshot(page)).frame).toBeGreaterThan(active.frame);
    await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.samples)).toBeGreaterThan(samples);
    expect((await gameSnapshot(page)).audio.generatedSamples).toBeGreaterThan(active.audio.generatedSamples);
    const objects = gameId === 'pong' ? null : await initialGameObjects(page, gameId);
    evidence.push({ cold, active: await gameSnapshot(page), gameId, objects });
    await gamePause(page);
    await page.getByRole('button', { name: 'How to play', exact: true }).click();
    await expect(page.locator('#help-heading')).toContainText(gameId === 'pong' ? 'Pong' : gameId === 'pongdoubles' ? 'Pong Doubles' : 'Space Race');
    await page.getByTestId('back').click(); await page.getByTestId('return-library').click();
    await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'library');
    expect(await page.evaluate(async () => { try { await (window as any).__nocpuDebug.snapshot(); return false; } catch { return true; } })).toBe(true);
    const scheduled = await page.evaluate(() => (window as any).__audioProbe.started);
    await page.waitForTimeout(150); expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(scheduled);

  }
  await testInfo.attach('selected-circuit-lifecycle.json', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
});

test('four genuine Doubles touches and simultaneous Space switches retain ownership and cancel cleanly', async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'CDP supplies simultaneous genuine browser touch contacts; physical iPhone qualification remains separate.');
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFromLibrary(page, 'pongdoubles'); await activateGame(page, 'pongdoubles');
  await initialGameObjects(page, 'pongdoubles');
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const tracks = await Promise.all([1, 2, 3, 4].map(async (player) => (await page.getByTestId(`paddle-p${player}`).locator('.control-track').boundingBox())!));
  const contacts = tracks.map((track, slot) => ({ id: slot + 11, x: track.x + track.width / 2,
    y: track.y + (slot % 2 ? track.height : 0), radiusX: 10, radiusY: 10 }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: contacts });
  await expect.poll(async () => (await gameSnapshot(page)).pointerCount).toBe(4);
  await expect.poll(async () => (await gameSnapshot(page)).axes).toEqual([-32768, 32767, -32768, 32767]);
  await expect.poll(async () => { const objects = await renderedGameObjects(page, 'pongdoubles'); return objects[1].y - objects[0].y > 200 && objects[3].y - objects[2].y > 200; }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('doubles-four-simultaneous-touches.png') });
  const held = await gameSnapshot(page);
  contacts[2].y = tracks[2].y + tracks[2].height;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: contacts });
  await expect.poll(async () => (await gameSnapshot(page)).axes).toEqual([-32768, 32767, 32767, 32767]);
  await expect.poll(async () => (await renderedGameObjects(page, 'pongdoubles'))[2].y).toBeGreaterThan(300);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await gameSnapshot(page)).pointerCount).toBe(0);
  const cancelled = await gameSnapshot(page); await advanceGame(page, 100000);
  expect((await gameSnapshot(page)).axes).toEqual(cancelled.axes);
  await launchFromLibrary(page, 'spacerace', false); await activateGame(page, 'spacerace');
  const buttons = await Promise.all(['direction-p1-up', 'direction-p2-down'].map(async (id) => (await page.getByTestId(id).boundingBox())!));
  const directions = buttons.map((box, slot) => ({ id: slot + 21, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 10, radiusY: 10 }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: directions });
  await expect.poll(async () => (await gameSnapshot(page)).pointerCount).toBe(2);
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([-1, 1]);
  await page.screenshot({ path: testInfo.outputPath('space-two-held-touch-switches.png') });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, 0]);
  expect((await gameSnapshot(page)).pointerCount).toBe(0);
  await session.detach();
  await testInfo.attach('simultaneous-touch-observations.json', { body: Buffer.from(JSON.stringify({ held, cancelled, final: await gameSnapshot(page) }, null, 2)), contentType: 'application/json' });
});

test('historical custom Pong settings migrate intact while new-game remaps persist independently', async ({ page }, testInfo) => {
  // A literal shipped v1 envelope, with real custom controls, not current defaults.
  const bindings = {
    keyboard: { p1Up: ['KeyQ'], p1Down: ['KeyA'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'], coin: ['KeyC'], menu: ['Space'], reset: ['KeyR'], mute: ['KeyM'] },
    gamepad: { players: [{ pad: 2, axis: 3, invert: true, deadzone: .23 }, { pad: 2, axis: 1, invert: false, deadzone: .31 }],
      buttons: { p1Up: [{ pad: 2, button: 12 }], p1Down: [{ pad: 2, button: 13 }], p2Up: [{ pad: 3, button: 12 }], p2Down: [{ pad: 3, button: 13 }],
        coin: [{ pad: 2, button: 7 }], menu: [{ pad: 3, button: 9 }], reset: [], mute: [] } },
  };
  await installFourGamepads(page);
  await page.addInitScript((bindings) => {
    if (!localStorage.getItem('nocpu.test.v1-seeded')) {
      localStorage.setItem('nocpu.preferences', JSON.stringify({ version: 1, preferences: { volume: .23, muted: true, bindings } }));
      localStorage.setItem('nocpu.test.v1-seeded', 'true');
    }
  }, bindings);
  await page.goto('./?debug'); await expect(page.getByTestId('title-version')).toHaveText(`V${version}`);
  await titleSettings(page);
  await expect(page.getByTestId('binding-p1Up')).toHaveText('Q'); await expect(page.getByTestId('binding-coin')).toHaveText('C');
  await expect(page.locator('#volume')).toHaveValue('23'); await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gamepad-p1-pad')).toHaveValue('2'); await expect(page.getByTestId('gamepad-p1-axis')).toHaveValue('3');
  await expect(page.getByTestId('gamepad-p1-invert')).toBeChecked(); await expect(page.getByTestId('gamepad-p1-deadzone')).toHaveValue('23');
  await page.getByTestId('settings-game').selectOption('spacerace');
  await expect(page.getByTestId('binding-p1Up')).toHaveText('W'); await expect(page.getByTestId('binding-start')).toHaveText('1');
  await page.getByTestId('binding-p1Up').click(); await page.keyboard.press('z'); await expect(page.getByTestId('binding-p1Up')).toHaveText('Z');
  await page.getByTestId('settings-game').selectOption('pongdoubles');
  await expect(page.getByTestId('binding-p3Up')).toHaveText('T'); await expect(page.getByTestId('gamepad-p4-pad')).toHaveValue('3');
  await page.getByTestId('binding-p3Up').click(); await page.keyboard.press('u'); await expect(page.getByTestId('binding-p3Up')).toHaveText('U');
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!));
  expect(persisted.version).toBe(4); expect(persisted.preferences.volume).toBe(.23); expect(persisted.preferences.muted).toBe(true);
  for (const action of Object.keys(bindings.keyboard)) {
    expect(persisted.preferences.bindings.keyboard[action]).toEqual(bindings.keyboard[action as keyof typeof bindings.keyboard]);
    expect(persisted.preferences.bindings.gamepad.buttons[action]).toEqual(bindings.gamepad.buttons[action as keyof typeof bindings.gamepad.buttons]);
  }
  expect(persisted.preferences.bindings.gamepad.players).toEqual(bindings.gamepad.players);
  await page.reload(); await titleSettings(page);
  await page.getByTestId('settings-game').selectOption('spacerace'); await expect(page.getByTestId('binding-p1Up')).toHaveText('Z');
  await page.getByTestId('settings-game').selectOption('pongdoubles'); await expect(page.getByTestId('binding-p3Up')).toHaveText('U');
  await page.getByTestId('settings-game').selectOption('pong'); await expect(page.getByTestId('binding-p1Up')).toHaveText('Q');
  await page.getByTestId('back').click(); await launchFromLibrary(page, 'pong');
  await page.keyboard.press('c'); await expect.poll(async () => (await gameSnapshot(page)).run).toBe(true);
  const pong = await gameSnapshot(page); await page.keyboard.down('q'); await expect.poll(async () => (await gameSnapshot(page)).axes[0]).toBeLessThan(pong.axes[0] - 1500); await page.keyboard.up('q');
  await padState(page, 2, { axis: [3, 1] }); await expect.poll(async () => (await gameSnapshot(page)).axes[0]).toBe(-32768);
  await padState(page, 2, { axis: [3, 0] });
  await launchFromLibrary(page, 'spacerace', false); await activateGame(page, 'spacerace');
  await page.keyboard.down('z'); await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([-1, 0]); await page.keyboard.up('z');
  await page.keyboard.down('q'); await advanceGame(page, 50000); expect((await gameSnapshot(page)).directions).toEqual([0, 0]); await page.keyboard.up('q');
  await launchFromLibrary(page, 'pongdoubles', false); await activateGame(page, 'pongdoubles');
  await page.keyboard.down('u'); await expect.poll(async () => (await gameSnapshot(page)).axes[2]).toBeLessThan(-1500); await page.keyboard.up('u');
  expect((await gameSnapshot(page)).axes[0]).toBe(0); expect((await gameSnapshot(page)).axes[1]).toBe(0); expect((await gameSnapshot(page)).axes[3]).toBe(0);
  await testInfo.attach('v1-to-v2-custom-control-migration.json', { body: Buffer.from(JSON.stringify({ historical: bindings, migrated: persisted }, null, 2)), contentType: 'application/json' });
});

test('original circuit settings remain separate from the active session until explicit Apply and reset', async ({ page }, testInfo) => {
  const evidence: unknown[] = [];
  for (const [index, gameId] of supported.entries()) {
    await launchFromLibrary(page, gameId, index === 0);
    const before = await gameSnapshot(page); await gameSettings(page);
    await expect(page.getByTestId('settings-game')).toHaveValue(gameId);
    if (gameId === 'spacerace') {
      await expect(page.getByTestId('coinage')).toHaveValue('1'); await expect(page.getByTestId('playtime')).toHaveValue('50');
      await page.getByTestId('coinage').selectOption('2');
      await page.getByTestId('playtime').focus(); await page.keyboard.press('Home'); await page.getByTestId('playtime').dispatchEvent('change');
    } else { await expect(page.getByTestId('winning-score')).toHaveValue('11'); await page.getByTestId('winning-score').selectOption('15'); }
    expect((await gameSnapshot(page)).options).toEqual(before.options);
    await page.getByTestId('settings-game').selectOption(gameId === 'pong' ? 'spacerace' : 'pong');
    await expect(page.getByTestId('apply-game-options')).toBeHidden(); expect((await gameSnapshot(page)).gameId).toBe(gameId);
    await page.getByTestId('settings-game').selectOption(gameId);
    await expect(page.getByTestId('game-options-status')).toContainText('ends the current game');
    await page.getByTestId('apply-game-options').click();
    await expect.poll(async () => (await gameSnapshot(page)).resetId).toBe(before.resetId + 1);
    const after = await gameSnapshot(page); expect(after.paused).toBe(true); expect(after.gameId).toBe(gameId);
    expect(after.options).toEqual(gameId === 'spacerace' ? { coinage: 2, playtimeOhms: 470000 } : { winningScore: 15 });
    expect(BigInt(after.timeps)).toBeLessThan(BigInt(before.timeps)); expect(after.axes).toEqual(Array(gameId === 'pongdoubles' ? 4 : gameId === 'pong' ? 2 : 0).fill(0));
    expect(after.directions).toEqual(Array(gameId === 'pongdoubles' ? 4 : 2).fill(0));
    if (gameId === 'spacerace') {
      await page.getByTestId('playtime').focus(); await page.keyboard.press('End'); await page.getByTestId('playtime').dispatchEvent('change');
      await page.getByTestId('apply-game-options').click(); await expect.poll(async () => (await gameSnapshot(page)).resetId).toBe(before.resetId + 2);
      expect((await gameSnapshot(page)).options).toEqual({ coinage: 2, playtimeOhms: 1470000 });
    }
    evidence.push({ before, after }); await resumeFromSettings(page);
  }
  await launchFromLibrary(page, 'pongdoubles', false); expect((await gameSnapshot(page)).options).toEqual({ winningScore: 15 });
  await launchFromLibrary(page, 'pong', false); expect((await gameSnapshot(page)).options).toEqual({ winningScore: 15 });
  await launchFromLibrary(page, 'spacerace', false); expect((await gameSnapshot(page)).options).toEqual({ coinage: 2, playtimeOhms: 1470000 });
  await page.reload(); await titleSettings(page); await page.getByTestId('settings-game').selectOption('spacerace');
  await expect(page.getByTestId('coinage')).toHaveValue('2'); await expect(page.getByTestId('playtime')).toHaveValue('100');
  await page.getByTestId('settings-game').selectOption('pongdoubles'); await expect(page.getByTestId('winning-score')).toHaveValue('15');
  await testInfo.attach('per-game-original-settings.json', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
});

test('new-game phone portrait, landscape and safe-area layouts retain a game-first unobscured raster and usable controls', async ({ page }, testInfo) => {
  const geometry: unknown[] = [];
  for (const [index, gameId] of (['pongdoubles', 'spacerace'] as const).entries()) {
    await launchFromLibrary(page, gameId, index === 0); await activateGame(page, gameId);
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size); await expectViewportShell(page); geometry.push(await externalControls(page, gameId));
      for (const id of ['insert-coin', 'start-game', 'pause']) await expectUsableTarget(page, id);
      await page.screenshot({ path: testInfo.outputPath(`${gameId}-game-first-${size.width}x${size.height}.png`) });
      await gamePause(page); for (const id of ['resume', 'reset', 'return-library']) await expectUsableTarget(page, id);
      await page.getByRole('button', { name: 'How to play', exact: true }).click();
      if (gameId === 'pongdoubles') { await expect(page.locator('#game-help-content')).toContainText('two coins'); await expect(page.locator('#game-help-content')).toContainText('four players'); }
      await expectViewportShell(page); await page.getByTestId('back').click(); await page.getByTestId('resume').click();
    }
    for (const [size, safe] of [
      [{ width: 320, height: 568 }, { top: 24, right: 0, bottom: 34, left: 0 }],
      [{ width: 568, height: 320 }, { top: 24, right: 44, bottom: 34, left: 44 }],
      [{ width: 844, height: 390 }, { top: 0, right: 44, bottom: 21, left: 44 }],
    ] as [{ width: number; height: number }, Insets][]) {
      await page.setViewportSize(size);
      await page.evaluate((safe) => { for (const [edge, value] of Object.entries(safe)) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`); }, safe);
      await expectViewportShell(page); geometry.push(await externalControls(page, gameId, safe));
      for (const id of ['insert-coin', 'start-game', 'pause']) await expectUsableTarget(page, id);
      await page.screenshot({ path: testInfo.outputPath(`${gameId}-reserved-safe-${size.width}x${size.height}.png`) });
      await page.evaluate(() => { for (const edge of ['top', 'right', 'bottom', 'left']) document.documentElement.style.removeProperty(`--safe-${edge}`); });
    }
  }
  await testInfo.attach('new-game-software-profile-geometry.json', { body: Buffer.from(JSON.stringify(geometry, null, 2)), contentType: 'application/json' });
});

test('short new-game reports bind actual title, circuit settings and native activity while excluding private controls', async ({ page }, testInfo) => {
  const reports: any[] = [];
  for (const [index, gameId] of (['pongdoubles', 'spacerace'] as const).entries()) {
    await launchFromLibrary(page, gameId, index === 0); await activateGame(page, gameId);
    const observed = await gameSnapshot(page); await gamePause(page);
    await page.getByTestId('menu-qualification').click(); await expect(page.getByTestId('qualification-start')).toBeEnabled();
    await page.getByTestId('qualification-start').click(); await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
    await advanceGame(page, 2500000); await gamePause(page); await page.getByTestId('menu-qualification').click();
    await page.getByTestId('qualification-finish').click(); await expect(page.getByTestId('qualification-report')).not.toHaveValue('');
    const report = JSON.parse(await page.getByTestId('qualification-report').inputValue());
    expect(report.game).toEqual({ id: gameId, options: observed.options }); expect(report.game_consistent).toBe(true);
    expect(report.game_sessions).toEqual([{ id: gameId, options: observed.options, generation: observed.generation }]);
    expect(report.manifest_start.version).toBe(version); expect(report.manifest_start.served_runtime_verified).toBe(true);
    expect(report.samples.length).toBeGreaterThan(2);
    for (const sample of report.samples) {
      expect(sample.state.gameId).toBe(gameId); expect(sample.state.gameOptions).toEqual(observed.options);
      expect(typeof sample.state.nativeRunning).toBe('boolean'); expect(sample.state.runN).toBe(Number(!sample.state.nativeRunning));
      expect(sample.state.attractN).toBe(gameId === 'spacerace' ? null : sample.state.nativeRunning ? 1 : 0);
      for (const privateKey of ['inputs', 'heldKeys', 'pointerCount', 'preferences', 'bindings', 'roms', 'userAgent']) expect(sample.state).not.toHaveProperty(privateKey);
    }
    expect(report.performance.simulation_seconds).toBeGreaterThan(0); expect(report.performance.native_frames).toBeGreaterThan(0);
    expect(report.performance.duration_requirement_met).toBe(false); expect(report.release_ready).toBe(false);
    // Explicit same-device identity survives another title's recording. Manual
    // checks belong to the current recording and must start blank instead.
    expect(report.device.physical).toBe(index === 0 ? null : false);
    expect(report.observations).toEqual({}); expect(report.performance.input_response).toBeNull(); expect(report.notes).toBeNull();
    await page.getByTestId('qualification-physical').selectOption('no');
    await page.getByTestId('qualification-observations').fill(`${gameId} software profile only; physical sound and touch remain untested.`);
    await page.getByTestId('qualification-input-response').fill(`${gameId} software input evidence only.`);
    await page.getByTestId('qualification-notes').fill(`${gameId} recording notes only.`);
    const annotated = JSON.parse(await page.getByTestId('qualification-report').inputValue());
    expect(annotated.samples).toEqual(report.samples); expect(annotated.performance.simulation_seconds).toBe(report.performance.simulation_seconds);
    expect(annotated.observations.manual).toContain(gameId); expect(annotated.performance.input_response).toContain(gameId); expect(annotated.notes).toContain(gameId);
    expect(annotated.device.physical).toBe(false); expect(annotated.release_ready).toBe(false); reports.push(annotated);
    await page.getByTestId('back').click(); await page.getByTestId('resume').click();
  }
  await testInfo.attach('new-title-software-qualification-reports.json', { body: Buffer.from(JSON.stringify(reports, null, 2)), contentType: 'application/json' });
});

test('recordings that cross original titles or settings retain measured samples and fail game-consistency qualification', async ({ page }, testInfo) => {
  await launchFromLibrary(page, 'pongdoubles'); await activateGame(page, 'pongdoubles'); await gamePause(page);
  await page.getByTestId('menu-qualification').click(); await expect(page.getByTestId('qualification-start')).toBeEnabled();
  await page.getByTestId('qualification-start').click(); await advanceGame(page, 1200000);
  await gameSettings(page); const old = await gameSnapshot(page);
  await page.getByTestId('winning-score').selectOption('15'); await page.getByTestId('apply-game-options').click();
  await expect.poll(async () => (await gameSnapshot(page)).resetId).toBe(old.resetId + 1); await resumeFromSettings(page); await activateGame(page, 'pongdoubles'); await advanceGame(page, 1200000);
  await launchFromLibrary(page, 'spacerace', false); await activateGame(page, 'spacerace'); await advanceGame(page, 1200000);
  await gamePause(page); await page.getByTestId('menu-qualification').click(); await page.getByTestId('qualification-finish').click();
  await expect(page.getByTestId('qualification-report')).not.toHaveValue(''); const report = JSON.parse(await page.getByTestId('qualification-report').inputValue());
  expect(report.game).toEqual({ id: 'pongdoubles', options: { winningScore: 11 } }); expect(report.game_consistent).toBe(false);
  expect(report.coverage_complete).toBe(false); expect(report.collection_errors.join(' ')).toMatch(/game|settings/i);
  expect(report.game_sessions.map((session: any) => ({ id: session.id, options: session.options }))).toEqual([
    { id: 'pongdoubles', options: { winningScore: 11 } }, { id: 'pongdoubles', options: { winningScore: 15 } }, { id: 'spacerace', options: { coinage: 1, playtimeOhms: 970000 } },
  ]);
  expect(report.performance.duration_requirement_met).toBe(false); expect(report.performance.speed_requirement_met).toBe(false); expect(report.release_ready).toBe(false);
  expect(report.samples.some((sample: any) => sample.state.gameId === 'spacerace' && sample.state.nativeRunning)).toBe(true);
  expect(report.samples.some((sample: any) => sample.state.gameId === 'pongdoubles' && sample.state.gameOptions.winningScore === 15)).toBe(true);
  await testInfo.attach('mixed-title-settings-fail-closed-report.json', { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' });
});

test('Pong Doubles keeps all four keyboard/controller channels independent and requires neutral after recovery', async ({ page }, testInfo) => {
  await installFourGamepads(page); await launchFromLibrary(page, 'pongdoubles'); await activateGame(page, 'pongdoubles');
  const before = await gameSnapshot(page);
  await initialGameObjects(page, 'pongdoubles');
  for (const [slot, key] of ['w', 'ArrowDown', 't', 'k'].entries()) {
    const previous = await gameSnapshot(page), pixels = await renderedGameObjects(page, 'pongdoubles');
    await page.keyboard.down(key);
    await expect.poll(async () => {
      const axes = (await gameSnapshot(page)).axes; return slot === 0 || slot === 2 ? previous.axes[slot] - axes[slot] : axes[slot] - previous.axes[slot];
    }).toBeGreaterThan(2000);
    await expect.poll(async () => {
      const moved = await renderedGameObjects(page, 'pongdoubles');
      return slot === 0 || slot === 2 ? pixels[slot].y - moved[slot].y : moved[slot].y - pixels[slot].y;
    }).toBeGreaterThan(2);
    const owned = await gameSnapshot(page);
    for (let other = 0; other < 4; other++) if (other !== slot) expect(owned.axes[other]).toBe(previous.axes[other]);
    await page.keyboard.up(key);
    const released = await gameSnapshot(page); await advanceGame(page, 50000);
    expect((await gameSnapshot(page)).axes).toEqual(released.axes);
  }
  for (let slot = 0; slot < 4; slot++) await padState(page, slot, { axis: [1, 0] });
  for (let slot = 0; slot < 4; slot++) await padState(page, slot, { axis: [1, slot % 2 ? 1 : -1] });
  await expect.poll(async () => (await gameSnapshot(page)).axes).toEqual([-32768, 32767, -32768, 32767]);
  await expect.poll(async () => { const objects = await renderedGameObjects(page, 'pongdoubles'); return objects[1].y - objects[0].y; }).toBeGreaterThan(200);
  await expect.poll(async () => { const objects = await renderedGameObjects(page, 'pongdoubles'); return objects[3].y - objects[2].y; }).toBeGreaterThan(200);
  await gamePause(page); const paused = await gameSnapshot(page); expect(paused.directions).toEqual([0, 0, 0, 0]);
  await page.getByTestId('reset').click(); await expect.poll(async () => (await gameSnapshot(page)).resetId).toBe(paused.resetId + 1);
  await page.getByTestId('resume').click(); await advanceGame(page, 100000);
  expect((await gameSnapshot(page)).axes).toEqual([0, 0, 0, 0]);
  for (let slot = 0; slot < 4; slot++) await padState(page, slot, { axis: [1, 0] });
  for (let slot = 0; slot < 4; slot++) await padState(page, slot, { axis: [1, slot % 2 ? -1 : 1] });
  await expect.poll(async () => (await gameSnapshot(page)).axes).toEqual([32767, -32768, 32767, -32768]);
  await padState(page, 2, { connected: false }); expect((await gameSnapshot(page)).directions).toEqual([0, 0, 0, 0]);
  await testInfo.attach('doubles-independent-channels.json', { body: Buffer.from(JSON.stringify({ before, final: await gameSnapshot(page) }, null, 2)), contentType: 'application/json' });
});

test('Doubles external rail endpoints, court gestures and cancellation do not cross player ownership', async ({ page }, testInfo) => {
  await launchFromLibrary(page, 'pongdoubles'); await activateGame(page, 'pongdoubles');
  const initial = await gameSnapshot(page);
  await initialGameObjects(page, 'pongdoubles');
  for (let slot = 0; slot < 4; slot++) {
    const rail = page.getByTestId(`paddle-p${slot + 1}`), track = (await rail.locator('.control-track').boundingBox())!;
    const target = (await rail.boundingBox())!;
    const before = await gameSnapshot(page);
    for (const [fraction, expected] of [[0, -32768], [1, 32767]] as const) {
      // WebKit delivers integer mouse coordinates. Round outward into the
      // existing padded target so both exact native endpoints remain reachable.
      const x = Math.round(track.x + track.width / 2);
      const y = fraction === 0 ? Math.floor(track.y) : Math.ceil(track.y + track.height);
      expect(x).toBeGreaterThanOrEqual(target.x); expect(x).toBeLessThan(target.x + target.width);
      expect(y).toBeGreaterThanOrEqual(target.y); expect(y).toBeLessThan(target.y + target.height);
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="slider"]')?.getAttribute('data-testid'), { x, y }))
        .toBe(`paddle-p${slot + 1}`);
      await page.mouse.move(x, y); await page.mouse.down();
      await expect.poll(async () => (await gameSnapshot(page)).axes[slot]).toBe(expected);
      if (fraction === 0) await expect.poll(async () => (await renderedGameObjects(page, 'pongdoubles'))[slot].y).toBeLessThan(130);
      else await expect.poll(async () => (await renderedGameObjects(page, 'pongdoubles'))[slot].y).toBeGreaterThan(300);
      const after = await gameSnapshot(page);
      for (let other = 0; other < 4; other++) if (other !== slot) expect(after.axes[other]).toBe(before.axes[other]);
      await page.mouse.up(); await expect.poll(async () => (await gameSnapshot(page)).pointerCount).toBe(0);
    }
    await rail.focus(); await page.keyboard.press('Home'); await expect.poll(async () => (await gameSnapshot(page)).axes[slot]).toBe(-32768);
    await page.keyboard.press('End'); await expect.poll(async () => (await gameSnapshot(page)).axes[slot]).toBe(32767);
  }
  const raster = (await page.getByTestId('game-canvas').boundingBox())!, held = await gameSnapshot(page);
  await page.mouse.move(raster.x + raster.width * .2, raster.y + raster.height * .2); await page.mouse.down();
  await page.mouse.move(raster.x + raster.width * .8, raster.y + raster.height * .8); await page.mouse.up();
  expect((await gameSnapshot(page)).axes).toEqual(held.axes);
  const track = (await page.getByTestId('paddle-p3').locator('.control-track').boundingBox())!;
  await page.mouse.move(track.x, track.y + track.height / 2); await page.mouse.down();
  await expect.poll(async () => (await gameSnapshot(page)).pointerCount).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  expect((await gameSnapshot(page)).pointerCount).toBe(0); await page.mouse.up();
  await page.getByTestId('resume').click(); await page.setViewportSize({ width: 844, height: 390 });
  await externalControls(page, 'pongdoubles'); await page.screenshot({ path: testInfo.outputPath('doubles-external-landscape.png') });
  expect((await gameSnapshot(page)).gameId).toBe(initial.gameId);
});

test('Space Race moves actual rockets and releases digital direction on opposing sources, centered pads and lifecycle boundaries', async ({ page }, testInfo) => {
  await installFourGamepads(page); await launchFromLibrary(page, 'spacerace');
  const initial = await gameSnapshot(page); expect(initial.axes).toEqual([]); expect(initial.attract).toBeNull(); expect(initial.hits).toBeNull();
  let movement: Awaited<ReturnType<typeof sourceCalibratedSpaceMovement>> | undefined;
  try {
    movement = await sourceCalibratedSpaceMovement(page);
    expect(movement.failure, 'Source-calibrated Space trajectory must prove both directions with uninterrupted native identity and visible original sprites').toBeUndefined();
  } finally {
    await testInfo.attach('space-native-movement-window.json', {
      body: Buffer.from(JSON.stringify({ initial, movement }, null, 2)), contentType: 'application/json',
    });
  }
  await page.keyboard.down('w'); await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([-1, 1]);
  await page.keyboard.down('s'); await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, 1]);
  await page.keyboard.up('w'); await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([1, 1]);
  await page.keyboard.up('s'); await page.keyboard.up('ArrowDown');
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, 0]);
  const down = (await page.getByTestId('direction-p1-down').boundingBox())!;
  await page.mouse.move(down.x + down.width / 2, down.y + down.height / 2); await page.mouse.down();
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([1, 0]);
  await page.keyboard.down('w'); await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, 0]);
  await page.mouse.up(); await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([-1, 0]);
  await page.keyboard.up('w');
  await padState(page, 0, { axis: [1, 0] }); await padState(page, 1, { axis: [1, 0] });
  await padState(page, 0, { axis: [1, -.8] }); await padState(page, 1, { axis: [1, .8] });
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([-1, 1]);
  await padState(page, 0, { axis: [1, 0] }); await padState(page, 1, { axis: [1, 0] });
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, 0]);
  const up = (await page.getByTestId('direction-p2-up').boundingBox())!;
  await page.mouse.move(up.x + up.width / 2, up.y + up.height / 2); await page.mouse.down();
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, -1]);
  await padState(page, 0, { connected: false });
  await expect.poll(async () => (await gameSnapshot(page)).directions).toEqual([0, 0]);
  expect((await gameSnapshot(page)).pointerCount).toBe(0); await page.mouse.up();
  await gamePause(page); const paused = await gameSnapshot(page); await page.getByTestId('reset').click();
  await expect.poll(async () => (await gameSnapshot(page)).resetId).toBe(paused.resetId + 1);
  expect((await gameSnapshot(page)).directions).toEqual([0, 0]);
  await page.getByTestId('resume').click(); await launchFromLibrary(page, 'pong', false);
  expect((await gameSnapshot(page)).directions).toEqual([0, 0]); expect((await gameSnapshot(page)).axes).toEqual([0, 0]);
  await testInfo.attach('space-digital-release.json', { body: Buffer.from(JSON.stringify({ initial, movementReference: movement?.reference, paused }, null, 2)), contentType: 'application/json' });
});
