// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';
import { auditedGames } from './rom-fixtures';
import { screen, titleSettings, installGamepads, padState, padPresent } from './app-helpers';
import { snapshot, start, waitSimulation, paddles, initialRenderedPaddles, installAudioProbe,
  openSettings, resumePlay, pauseMenu, expectViewportShell, expectUsableTarget, expectDesktopLayout, playFromLibrary } from './helpers';

test('all audited games have truthful library, ROM, sound and control information with six implemented circuits and player-ROM launch gates', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__libraryWorkers = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); (window as any).__libraryWorkers += 1;
      }
    };
    const native = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
      const request = native.apply(this, args);
      return new Proxy(request, {
        get(target, key) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; },
        set(target, key, value) {
          return Reflect.set(target, key, key === 'onsuccess' && typeof value === 'function'
            ? (event: Event) => { (window as any).__releaseRomReadiness = () => value.call(target, event); } : value, target);
        },
      });
    };
  });
  await page.goto('?debug');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseRomReadiness)).toBe('function');
  await page.getByTestId('open-library').click();
  await expect(page.getByTestId('game-library').locator('.game-name')).toHaveText(auditedGames.map((game) => game.display_name));
  await page.getByTestId('game-antiaircraft').click();
  const disclosure = page.locator('.rom-requirements summary');
  await disclosure.click();
  await disclosure.focus();
  await expect(page.getByTestId('storage-status')).toContainText('Checking local');
  await page.evaluate(() => (window as any).__releaseRomReadiness());
  await expect(page.getByTestId('storage-status')).not.toContainText('Checking local');
  expect(await page.locator('.rom-requirements').evaluate((element) => (element as HTMLDetailsElement).open),
    'Delayed local storage refresh must preserve the opened requirements').toBe(true);
  await expect(disclosure).toBeFocused();
  await page.getByTestId('back').click();
  for (const game of auditedGames) {
    await page.getByTestId(`game-${game.id}`).click();
    await screen(page, 'game-info');
    await expect(page.locator('#game-info-heading')).toHaveText(game.display_name);
    await expect(page.getByTestId('game-port-status')).toHaveText(['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4'].includes(game.id) ? 'Ready to play' : 'Browser port pending');
    await expect(page.getByTestId('game-rom-status')).toHaveText(game.roms.length ? 'ROM required · not imported' : 'No ROM needed');
    await expect(page.getByTestId('game-audio-status')).toHaveText(game.audio.mono_output_wired
      ? ['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4'].includes(game.id) ? 'Original circuit sound' : 'DICE circuit sound · browser port pending'
      : 'Inherited audio unavailable in DICE');
    if (['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4'].includes(game.id)) await expect(page.getByTestId('play-selected')).toBeEnabled();
    else await expect(page.getByTestId('play-selected')).toBeDisabled();
    if (['stuntcycle', 'indy4'].includes(game.id)) {
      await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
      await page.getByTestId('play-selected').click();
      await screen(page, 'game-info');
      await expect(page.getByTestId('rom-launch-message')).toBeVisible();
      await expect(page.getByTestId('game-rom-status')).toHaveText('ROM required · not imported');
      expect(await page.evaluate(() => (window as any).__libraryWorkers),
        'An unimported selected game must fail before constructing a core worker').toBe(0);
      await expect(page.getByRole('button', { name: 'Local ROMs', exact: true })).toBeEnabled();
    }

    if (game.roms.length) {
      await page.getByText('Required ROM files', { exact: true }).click();
      for (const requirement of game.roms) await expect(page.locator('.rom-requirements')).toContainText(requirement.expected_member);
    }
    await page.getByRole('button', { name: 'Controls & help', exact: true }).click();
    if (game.id === 'stuntcycle') {
      await expect(page.locator('#game-help-content')).toContainText('alternating turns');
      await expect(page.locator('#game-help-content')).toContainText('shared throttle');
    } else if (game.id === 'indy4') {
      await expect(page.locator('#game-help-content')).toContainText('There is no Start button');
      await expect(page.locator('#game-help-content')).toContainText('Gas and Hand Brake');
    }

    if (!['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4'].includes(game.id)) for (const control of game.controls) {
      await expect(page.locator('#game-help-content')).toContainText(control.label);
    }
    await page.getByTestId('back').click();
    await screen(page, 'game-info');
    await expect(page.getByRole('button', { name: 'Controls & help', exact: true })).toBeFocused();
    await page.getByTestId('back').click();
    await screen(page, 'library');
    await expect(page.getByTestId(`game-${game.id}`)).toBeFocused();
  }
  await page.getByTestId('back').click();
  await screen(page, 'title');
  await expect(page.getByTestId('open-library')).toBeFocused();
});

test('return to library disposes the running circuit and audio before a fresh ROM-free Pong start', { tag: '@game-pong' }, async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('?debug');
  await start(page);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  const activated = await snapshot(page);
  await waitSimulation(page, BigInt(activated.timeps) + 500_000_000_000n);
  const running = await snapshot(page);
  expect(running.run).toBe(true);
  await pauseMenu(page);
  await page.getByTestId('return-library').click();
  await screen(page, 'library');
  expect(await page.evaluate(async () => {
    try { await (window as any).__nocpuDebug.snapshot(); return false; } catch { return true; }
  }), 'Disposed library view must have no live worker snapshot').toBe(true);
  const stopped = await page.evaluate(() => (window as any).__audioProbe.started);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__audioProbe.started), 'Library view must schedule no further circuit audio').toBe(stopped);
  await page.getByTestId('game-pong').click();
  await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  await waitSimulation(page, 250_000_000_000n);
  const fresh = await snapshot(page);
  expect(fresh.attract).toBe(true);
  expect(fresh.run).toBe(false);
  expect(fresh.scores).toEqual([0, 0]);
  expect(BigInt(fresh.timeps)).toBeLessThan(BigInt(running.timeps));
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
});

test('the title offers Continue for the last started playable game and leads with Library otherwise', { tag: '@game-pong' }, async ({ page }) => {
  const resume = page.getByTestId('continue-game');
  const library = page.getByTestId('open-library');
  const remember = (lastGameId: unknown) => page.evaluate((lastGameId) => {
    const stored = JSON.parse(localStorage.getItem('nocpu.preferences')!);
    stored.preferences.lastGameId = lastGameId;
    localStorage.setItem('nocpu.preferences', JSON.stringify(stored));
  }, lastGameId);
  await page.goto('?debug');
  await screen(page, 'title');
  await expect(resume).toBeHidden();
  await expect(library).toBeFocused();
  await expect(library).toHaveClass(/primary-button/);
  await playFromLibrary(page);
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await pauseMenu(page);
  await page.getByTestId('return-title').click();
  await screen(page, 'title');
  await expect(resume).toHaveText('Continue: Pong');
  await expect(resume).toBeFocused();
  await expect(library).not.toHaveClass(/primary-button/);
  await page.reload();
  await screen(page, 'title');
  await expect(resume).toHaveText('Continue: Pong');
  await expect(resume).toBeFocused();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!));
  expect(saved.version).toBe(6);
  expect(saved.preferences.lastGameId).toBe('pong');
  await resume.click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  expect(await page.evaluate(async () => (await (window as any).__nocpuDebug.snapshot()).gameId)).toBe('pong');
  // A remembered game that is unknown or not playable in this build is ignored
  // without disturbing the saved settings.
  for (const stale of ['antiaircraft', 'bogus', 7]) {
    await remember(stale);
    await page.reload();
    await screen(page, 'title');
    await expect(resume).toBeHidden();
    await expect(library).toBeFocused();
    await expect(library).toHaveClass(/primary-button/);
    await titleSettings(page);
    await expect(page.getByTestId('preferences-status')).toHaveText('Settings are saved on this device.');
  }
});

test('Continue to a remembered ROM game without its ROM opens the game info message as Play does', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__continueWorkers = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); (window as any).__continueWorkers += 1; }
    };
  });
  await page.goto('?debug');
  await titleSettings(page);
  await page.locator('#volume').fill('50');
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('nocpu.preferences')!);
    stored.preferences.lastGameId = 'stuntcycle';
    localStorage.setItem('nocpu.preferences', JSON.stringify(stored));
  });
  await page.reload();
  await screen(page, 'title');
  await expect(page.getByTestId('continue-game')).toHaveText('Continue: Stunt Cycle');
  await expect(page.getByTestId('continue-game')).toBeFocused();
  await page.getByTestId('continue-game').click();
  await screen(page, 'game-info');
  await expect(page.locator('#game-info-heading')).toHaveText('Stunt Cycle');
  await expect(page.getByTestId('rom-launch-message')).toBeVisible();
  await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
  expect(await page.evaluate(() => (window as any).__continueWorkers), 'A missing ROM must fail before constructing a core worker').toBe(0);
  await page.getByTestId('back').click();
  await screen(page, 'library');
  await expect(page.getByTestId('game-stuntcycle')).toBeFocused();
  await page.getByTestId('back').click();
  await screen(page, 'title');
  await expect(page.getByTestId('continue-game')).toHaveText('Continue: Stunt Cycle');
});

test('keyboard assignment consumes capture, rejects conflicts, updates help and persists actual paddle controls', async ({ page }) => {
  await page.goto('?debug');
  await start(page);
  await page.getByTestId('insert-coin').click();
  await openSettings(page);
  const frozen = await snapshot(page);
  await page.getByTestId('binding-p1Down').click();
  await page.keyboard.press('w');
  await expect(page.getByTestId('binding-message')).toContainText('already assigned');
  await expect(page.getByTestId('binding-p1Down')).toHaveText('S');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cancel-binding')).toBeHidden();
  await expect(page.getByTestId('binding-p1Down')).toBeFocused();
  await screen(page, 'settings');
  expect((await snapshot(page)).timeps).toBe(frozen.timeps);
  expect((await snapshot(page)).heldKeys).toEqual([]);
  await page.getByTestId('binding-p1Down').click();
  await page.keyboard.press('Control+j');
  await expect(page.getByTestId('binding-message')).toContainText('without Ctrl, Alt or Meta');
  await expect(page.getByTestId('binding-p1Down')).toHaveText('S');
  await page.keyboard.press('Escape');
  await page.getByTestId('binding-p1Down').click();
  await page.keyboard.press('j');
  await expect(page.getByTestId('binding-p1Down')).toHaveText('J');
  await expect(page.getByTestId('preferences-status')).toContainText('saved on this device');
  await page.getByTestId('back').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content .controls-help').first()).toContainText('J');
  await page.getByTestId('back').click();
  await resumePlay(page);
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('aria-label', /Player 1 uses W and J/);
  await initialRenderedPaddles(page);
  const before = await snapshot(page), pixelsBefore = await paddles(page);
  await page.keyboard.down('s');
  await waitSimulation(page, BigInt(before.timeps) + 150_000_000_000n);
  expect((await snapshot(page)).axes[0], 'Old assignment must no longer move the circuit').toBe(before.axes[0]);
  await page.keyboard.up('s');
  await page.keyboard.down('j');
  await expect.poll(async () => (await snapshot(page)).axes[0] - before.axes[0]).toBeGreaterThan(5000);
  await page.keyboard.up('j');
  await expect.poll(async () => (await paddles(page))[0] - pixelsBefore[0]).toBeGreaterThan(.07);
  await openSettings(page);
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('binding-p1Down')).toHaveText('J');
  await page.getByTestId('controls-defaults').click();
  await expect(page.getByTestId('binding-p1Down')).toHaveText('S');
  await page.reload();
  await titleSettings(page);
  await expect(page.getByTestId('binding-p1Down')).toHaveText('S');
});

test('gamepads independently move rendered paddles and require neutral inputs after menu, disconnect and reset', async ({ page }) => {
  await installGamepads(page);
  await page.goto('?debug');
  await start(page);
  await page.getByTestId('insert-coin').click();
  await initialRenderedPaddles(page);
  await padState(page, 0, { axis: [1, -.7] });
  await padState(page, 1, { axis: [1, .7] });
  await expect.poll(async () => (await snapshot(page)).axes[0]).toBeLessThan(-20000);
  await expect.poll(async () => (await snapshot(page)).axes[1]).toBeGreaterThan(20000);
  await expect.poll(async () => (await paddles(page))[1] - (await paddles(page))[0]).toBeGreaterThan(.4);
  await padState(page, 0, { axis: [1, .05] });
  const retained = (await snapshot(page)).axes[0];
  await page.keyboard.down('s');
  await expect.poll(async () => (await snapshot(page)).axes[0] - retained).toBeGreaterThan(3000);
  await page.keyboard.up('s');
  await padState(page, 0, { button: [9, true] });
  await screen(page, 'paused');
  const paused = await snapshot(page);
  expect(paused.heldKeys).toEqual([]);
  await padState(page, 0, { connected: false });
  await padState(page, 0, { button: [9, false] });
  await padState(page, 0, { button: [9, true] });
  await screen(page, 'paused');
  await padState(page, 0, { connected: true });
  await screen(page, 'paused');
  await padPresent(page, 0, false);
  await padPresent(page, 0, true);
  await page.waitForTimeout(100);
  await screen(page, 'paused');
  expect((await snapshot(page)).timeps, 'Held menu button on reconnect must not implicitly resume').toBe(paused.timeps);
  await page.getByTestId('resume').click();
  await waitSimulation(page, BigInt(paused.timeps) + 150_000_000_000n);
  await screen(page, 'playing');
  expect((await snapshot(page)).axes[1]).toBe(paused.axes[1]);
  await padState(page, 0, { button: [9, false] });
  await padState(page, 0, { button: [9, true] });
  await screen(page, 'paused');
  await padState(page, 0, { button: [9, false] });
  await padState(page, 0, { button: [9, true] });
  await screen(page, 'playing');
  await padState(page, 0, { button: [9, false] });
  await padState(page, 1, { axis: [1, 0] });
  await padState(page, 1, { axis: [1, -.7] });
  await expect.poll(async () => (await snapshot(page)).axes[1]).toBeLessThan(-20000);
  await padState(page, 0, { button: [13, true] });
  const held = await snapshot(page);
  await expect.poll(async () => (await snapshot(page)).axes[0] - held.axes[0]).toBeGreaterThan(1500);
  await padState(page, 0, { connected: false });
  await expect.poll(async () => (await snapshot(page)).heldKeys).toEqual([]);
  const disconnected = await snapshot(page);
  await waitSimulation(page, BigInt(disconnected.timeps) + 120_000_000_000n);
  expect((await snapshot(page)).axes).toEqual(disconnected.axes);
  await padState(page, 0, { connected: true });
  const reconnected = await snapshot(page);
  await waitSimulation(page, BigInt(reconnected.timeps) + 120_000_000_000n);
  expect((await snapshot(page)).axes).toEqual(reconnected.axes);
  await padState(page, 0, { button: [13, false], axis: [1, 0] });
  await padState(page, 1, { axis: [1, 0] });
  await pauseMenu(page);
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('reset')).toBeEnabled();
  await resumePlay(page);
  await padState(page, 0, { axis: [1, 0] });
  await padState(page, 0, { axis: [1, .7] });
  await expect.poll(async () => (await snapshot(page)).axes[0]).toBeGreaterThan(20000);
});

test('gamepad capture rejects conflicts, assigns independent axes and consumes the remap gesture', async ({ page }) => {
  await installGamepads(page);
  await page.goto('?debug');
  await titleSettings(page);
  await expect(page.getByTestId('gamepad-status')).toContainText('Synthetic platform controller');
  await page.getByTestId('gamepad-binding-reset').click();
  await padState(page, 0, { button: [0, true] });
  await expect(page.getByTestId('binding-message')).toContainText('already assigned');
  await page.keyboard.press('Escape');
  await page.getByTestId('gamepad-binding-reset').click();
  await padState(page, 0, { button: [2, true] });
  await expect(page.getByTestId('gamepad-binding-reset')).toHaveText('Controller 1 · button 3');
  await page.getByTestId('bind-axis-p1').click();
  await padState(page, 0, { axis: [2, -.8] });
  await expect(page.getByTestId('gamepad-p1-axis')).toHaveValue('2');
  await page.getByTestId('gamepad-p2-pad').selectOption('0');
  await page.getByTestId('gamepad-p2-axis').selectOption('2');
  await expect(page.getByTestId('binding-message')).toContainText('independent gamepad axes');
  await expect(page.getByTestId('gamepad-p2-axis')).toHaveValue('1');
  await page.getByTestId('back').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('Player 1 (left paddle): controller 1, axis 3');
  await expect(page.locator('#game-help-content')).toContainText('Controller 1 · button 3');
  await page.getByTestId('back').click();
  await playFromLibrary(page);
  await expect(page.getByTestId('insert-coin')).toBeEnabled();
  const fresh = await snapshot(page);
  expect(fresh.attract).toBe(true);
  expect(fresh.axes).toEqual([0, 0]);
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await snapshot(page)).run).toBe(true);
  await padState(page, 0, { axis: [2, 0], button: [2, false] });
  await padState(page, 0, { axis: [2, -.7] });
  await expect.poll(async () => (await snapshot(page)).axes[0]).toBeLessThan(-20000);
  await openSettings(page);
  await page.getByTestId('gamepad-p1-invert').check();
  await page.getByTestId('gamepad-p1-deadzone').fill('50');
  await page.getByTestId('back').click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('#game-help-content')).toContainText('axis 3 reversed; 50% deadzone');
  await page.getByTestId('back').click();
  await resumePlay(page);
  const retained = (await snapshot(page)).axes[0];
  await padState(page, 0, { axis: [2, -.4] });
  expect((await snapshot(page)).axes[0], 'Configured deadzone must retain the previous absolute paddle position').toBe(retained);
  await padState(page, 0, { axis: [2, -.75] });
  await expect.poll(async () => (await snapshot(page)).axes[0]).toBe(16384);
  await padState(page, 0, { button: [2, true] });
  await expect.poll(async () => (await snapshot(page)).attract).toBe(true);
  const reset = await snapshot(page);
  await waitSimulation(page, BigInt(reset.timeps) + 200_000_000_000n);
  expect(BigInt((await snapshot(page)).timeps)).toBeGreaterThan(BigInt(reset.timeps));
});

test('library, info and settings stay reachable inside small desktop windows', async ({ page }, testInfo) => {
  const geometries = [{ width: 800, height: 600 }, { width: 1024, height: 480 }, { width: 1280, height: 720 }];
  for (const viewport of geometries) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await page.getByTestId('open-library').click();
    await expectViewportShell(page);
    for (const game of [auditedGames[0], auditedGames.at(-1)!]) {
      await page.getByTestId(`game-${game.id}`).scrollIntoViewIfNeeded();
      await expectUsableTarget(page, `game-${game.id}`);
    }
    await page.getByTestId('game-antiaircraft').click();
    await page.getByRole('button', { name: 'Local ROMs', exact: true }).click();
    await screen(page, 'settings');
    await expect(page.getByTestId('rom-game')).toHaveValue('antiaircraft');
    for (const id of ['binding-p1Up', 'gamepad-binding-mute', 'controls-defaults', 'fullscreen']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      await expectUsableTarget(page, id);
      await expectViewportShell(page);
    }
    await page.screenshot({ path: testInfo.outputPath(`settings-${viewport.width}x${viewport.height}.png`) });
    await page.getByTestId('back').click();
    await screen(page, 'game-info');
    await expect(page.getByRole('button', { name: 'Local ROMs', exact: true })).toBeFocused();
    await expectViewportShell(page);
    await page.screenshot({ path: testInfo.outputPath(`info-${viewport.width}x${viewport.height}.png`) });
    await page.getByTestId('back').click();
    await screen(page, 'library');
    await page.screenshot({ path: testInfo.outputPath(`library-${viewport.width}x${viewport.height}.png`) });
    await page.getByTestId('back').click();
    await playFromLibrary(page);
    await expect(page.getByTestId('insert-coin')).toBeEnabled();
    await expectDesktopLayout(page);
  }
});
