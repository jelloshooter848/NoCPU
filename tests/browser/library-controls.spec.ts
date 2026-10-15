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
  // The app abandons an IndexedDB open that has not answered within 2.5 s and
  // reports storage unavailable. The test holds the open's success until the
  // ROM requirements are opened, so pause the page clock for that hold: on a
  // slow engine (WebKit on CI once stalled 1.2 s drawing Play) the app's
  // timeout must not preempt the delayed success this test is checking.
  const clockStart = Date.now();
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(clockStart + 1_000);
  await page.goto('?debug');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseRomReadiness)).toBe('function');
  await page.getByTestId('open-library').click();
  // Play lists the six ported games, then every other audited game under Coming soon, each in audited order.
  const ported = ['pong', 'pongdoubles', 'spacerace', 'breakout', 'stuntcycle', 'indy4'];
  await expect(page.locator('.play-list .game-name')).toHaveText(auditedGames.filter((game) => ported.includes(game.id)).map((game) => game.display_name));
  await expect(page.locator('.coming-soon-list .game-name')).toHaveText(auditedGames.filter((game) => !ported.includes(game.id)).map((game) => game.display_name));
  await expect(page.getByTestId('game-library').locator('.game-name')).toHaveCount(auditedGames.length);
  await page.getByTestId('game-antiaircraft').click();
  const disclosure = page.locator('.rom-requirements summary');
  await disclosure.click();
  await disclosure.focus();
  await expect(page.getByTestId('storage-status')).toContainText('Checking local');
  await page.evaluate(() => (window as any).__releaseRomReadiness());
  await expect(page.getByTestId('storage-status')).not.toContainText('Checking local');
  // The delayed open succeeded; it did not fall back to the unavailable path.
  await expect(page.getByTestId('storage-status')).not.toContainText('unavailable');
  expect(await page.locator('.rom-requirements').evaluate((element) => (element as HTMLDetailsElement).open),
    'Delayed local storage refresh must preserve the opened requirements').toBe(true);
  await expect(disclosure).toBeFocused();
  await page.clock.resume();
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

test('Home leads with Play, and Play opens on the last game played', { tag: '@game-pongdoubles' }, async ({ page }) => {
  const library = page.getByTestId('open-library');
  const titleButtons = page.locator('[data-panel="title"] .menu-actions button');
  const titleNames = ['Play', 'Settings', 'How to play', 'About'];
  await page.goto('?debug');
  await screen(page, 'title');
  await expect(titleButtons.locator('.pin-name')).toHaveText(titleNames);
  for (const [index, name] of titleNames.entries()) await expect(titleButtons.nth(index)).toHaveAccessibleName(name);
  await expect(page.getByTestId('continue-game')).toHaveCount(0);
  // The title block's sheet count and the footer both count the playable games in this build.
  const playable = await page.locator('.play-list .library-game').count();
  expect(playable).toBe(6);
  await expect(page.getByTestId('title-sheet')).toHaveText(`1 OF ${playable}`);
  await expect(page.getByTestId('title-footer')).toHaveText(`ENGINE DICE 0.9 · ${playable} OF ${auditedGames.length} GAMES PLAYABLE`);
  await expect(library).toBeFocused();
  await expect(library).toHaveClass(/primary-button/);
  // With nothing played yet Play opens on its first game.
  await library.click();
  await screen(page, 'library');
  await expect(page.locator('.library-game').first()).toBeFocused();
  await page.getByTestId('back').click();
  await screen(page, 'title');
  await playFromLibrary(page, 'pongdoubles');
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await pauseMenu(page);
  await page.getByTestId('return-title').click();
  await screen(page, 'title');
  await expect(titleButtons.locator('.pin-name')).toHaveText(titleNames);
  for (const [index, name] of titleNames.entries()) await expect(titleButtons.nth(index)).toHaveAccessibleName(name);
  await expect(library).toBeFocused();
  await expect(library).toHaveClass(/primary-button/);
  await page.keyboard.press('Enter');
  await screen(page, 'library');
  await expect(page.getByTestId('game-pongdoubles')).toBeFocused();
  await expect(page.getByTestId('play-detail-name')).toHaveText('Pong Doubles');
  await expect(page.locator('#library-heading')).toHaveText('Play');
  await expect(page.getByTestId('back')).toHaveText('← Home');
  // Back from a game's info page still returns focus to the game chosen.
  await page.getByTestId('game-breakout').click();
  await screen(page, 'game-info');
  await page.getByTestId('back').click();
  await screen(page, 'library');
  await expect(page.getByTestId('game-breakout')).toBeFocused();
  await page.getByTestId('back').click();
  await screen(page, 'title');
  await page.reload();
  await screen(page, 'title');
  await expect(library).toBeFocused();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nocpu.preferences')!));
  expect(saved.version).toBe(6);
  expect(saved.preferences.lastGameId).toBe('pongdoubles');
  await library.click();
  await screen(page, 'library');
  await expect(page.getByTestId('game-pongdoubles')).toBeFocused();
  await expect(page.getByTestId('game-pongdoubles')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('play-detail-name')).toHaveText('Pong Doubles');
  // The selected game's Play button starts it directly.
  await page.getByTestId('play-preview').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  expect(await page.evaluate(async () => (await (window as any).__nocpuDebug.snapshot()).gameId)).toBe('pongdoubles');
});

test('Home draws its schematic in at most once per session, skippable, keyboard-usable and never under reduced motion', async ({ page }) => {
  const intro = (target: typeof page) => target.locator('[data-panel="title"]');
  const menuOpacity = (target: typeof page) => target.locator('.sheet-side').evaluate((element) => getComputedStyle(element).opacity);
  await page.goto('?debug');
  await expect(intro(page)).toHaveAttribute('data-intro', 'drawing');
  // The menu is focused and usable from the start; only its appearance fades in.
  await expect(page.getByTestId('open-library')).toBeFocused();
  await page.keyboard.press('Shift');
  await expect(intro(page)).not.toHaveAttribute('data-intro');
  await expect.poll(() => menuOpacity(page)).toBe('1');
  // Later visits to Home in the same session show the finished sheet at once.
  await page.reload();
  await screen(page, 'title');
  await expect(intro(page)).not.toHaveAttribute('data-intro');
  expect(await menuOpacity(page)).toBe('1');

  // A new tab is a new session: Enter during the draw-in skips it and opens Play.
  const second = await page.context().newPage();
  await second.goto('?debug');
  await expect(intro(second)).toHaveAttribute('data-intro', 'drawing');
  await second.keyboard.press('Enter');
  await screen(second, 'library');
  await second.getByTestId('back').click();
  await screen(second, 'title');
  await expect(intro(second)).not.toHaveAttribute('data-intro');
  await second.close();

  // A click skips it, and left alone it finishes by itself.
  const third = await page.context().newPage();
  await third.goto('?debug');
  await expect(intro(third)).toHaveAttribute('data-intro', 'drawing');
  await third.mouse.click(4, 4);
  await expect(intro(third)).not.toHaveAttribute('data-intro');
  await third.close();
  const fourth = await page.context().newPage();
  await fourth.goto('?debug');
  await expect(intro(fourth)).toHaveAttribute('data-intro', 'drawing');
  await expect(intro(fourth)).not.toHaveAttribute('data-intro', /./, { timeout: 5_000 });
  await expect.poll(() => menuOpacity(fourth)).toBe('1');
  await fourth.close();

  // Reduced motion never runs it.
  const reduced = await page.context().newPage();
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.goto('?debug');
  await screen(reduced, 'title');
  await expect(intro(reduced)).not.toHaveAttribute('data-intro');
  expect(await menuOpacity(reduced)).toBe('1');
  await expect(reduced.getByTestId('open-library')).toBeFocused();
  await reduced.close();
});

test('Play moves between games with Up and Down, describes the selected game and plays it with Enter', async ({ page }) => {
  const games = Object.fromEntries(auditedGames.map((game) => [game.id, game]));
  const details = async (id: string, players: number, rom: string, play: string) => {
    await expect(page.getByTestId(`game-${id}`)).toBeFocused();
    await expect(page.getByTestId(`game-${id}`)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.library-game[aria-current="true"]')).toHaveCount(1);
    await expect(page.getByTestId('play-detail-name')).toHaveText(games[id].display_name);
    await expect(page.getByTestId('play-detail-meta')).toHaveText(`${games[id].manufacturer} · ${games[id].year} · up to ${players} players`);
    await expect(page.getByTestId('play-detail-rom')).toHaveText(rom);
    await expect(page.getByTestId('play-preview')).toHaveText(play);
  };
  await page.goto('?debug');
  await page.getByTestId('open-library').click();
  await screen(page, 'library');
  await details('pong', 2, 'No ROM needed', 'Play');
  await expect(page.getByTestId('play-detail-verified')).toHaveText('✓ Verified against original DICE');
  await page.keyboard.press('ArrowUp');
  await details('pong', 2, 'No ROM needed', 'Play');
  await page.keyboard.press('ArrowDown');
  await details('pongdoubles', 4, 'No ROM needed', 'Play');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await details('stuntcycle', 2, 'ROM required · not imported', 'Import ROMs to play');
  await expect(page.getByTestId('play-detail-verified')).toBeVisible();
  // Without its ROM, Play explains on the game's info page and creates no circuit.
  await page.getByTestId('play-preview').click();
  await screen(page, 'game-info');
  await expect(page.getByTestId('rom-launch-message')).toBeVisible();
  await expect(page.locator('#game-info-heading')).toHaveText('Stunt Cycle');
  await page.getByTestId('back').click();
  await screen(page, 'library');
  await expect(page.getByTestId('game-stuntcycle')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await details('indy4', 4, 'ROM required · not imported', 'Import ROMs to play');
  // Down continues into the games that are not ported yet; they cannot be played.
  await page.keyboard.press('ArrowDown');
  await details('rebound', 2, 'Browser port pending', 'Coming soon');
  await expect(page.getByTestId('play-preview')).toBeDisabled();
  await expect(page.getByTestId('play-detail-verified')).toBeHidden();
  await page.keyboard.press('ArrowUp');
  await details('indy4', 4, 'ROM required · not imported', 'Import ROMs to play');
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.library-game').last()).toBeFocused();
  // Enter on a game not ported yet opens its info page; nothing can start.
  const last = page.locator('.library-game').last();
  const lastId = (await last.getAttribute('data-game-id'))!;
  await page.keyboard.press('Enter');
  await screen(page, 'game-info');
  await expect(page.locator('#game-info-heading')).toHaveText(games[lastId].display_name);
  await expect(page.getByTestId('play-selected')).toBeDisabled();
  await page.keyboard.press('Escape');
  await screen(page, 'library');
  await expect(last).toBeFocused();
  // Enter on a ROM game without its ROM explains on the info page, exactly as Play does.
  await page.getByTestId('game-stuntcycle').focus();
  await page.keyboard.press('Enter');
  await screen(page, 'game-info');
  await expect(page.locator('#game-info-heading')).toHaveText('Stunt Cycle');
  await expect(page.getByTestId('rom-launch-message')).toBeVisible();
  await page.keyboard.press('Escape');
  await screen(page, 'library');
  await expect(page.getByTestId('game-stuntcycle')).toBeFocused();
  // Space, like a click, opens the focused game's info page.
  await page.getByTestId('game-pong').focus();
  await page.keyboard.press('Space');
  await screen(page, 'game-info');
  await expect(page.locator('#game-info-heading')).toHaveText('Pong');
  await page.keyboard.press('Escape');
  await screen(page, 'library');
  await expect(page.getByTestId('game-pong')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.getByTestId('preview-info').click();
  await screen(page, 'game-info');
  await expect(page.locator('#game-info-heading')).toHaveText('Pong Doubles');
  await page.keyboard.press('Escape');
  await screen(page, 'library');
  await expect(page.getByTestId('preview-info')).toBeFocused();
  // Escape goes Home.
  await page.keyboard.press('Escape');
  await screen(page, 'title');
  await expect(page.getByTestId('open-library')).toBeFocused();
  // Enter on a playable game starts it directly.
  await page.keyboard.press('Enter');
  await screen(page, 'library');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('game-pongdoubles')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await screen(page, 'playing');
  expect(await page.evaluate(async () => (await (window as any).__nocpuDebug.snapshot()).gameId)).toBe('pongdoubles');
});

test('a remembered game is kept only while playable; stale ids open the Library on its first game without a warning', async ({ page }) => {
  const library = page.getByTestId('open-library');
  const remember = (lastGameId: unknown) => page.evaluate((lastGameId) => {
    const stored = JSON.parse(localStorage.getItem('nocpu.preferences')!);
    stored.preferences.lastGameId = lastGameId;
    localStorage.setItem('nocpu.preferences', JSON.stringify(stored));
  }, lastGameId);
  await page.goto('?debug');
  await titleSettings(page);
  await page.locator('#volume').fill('50');
  // A playable ROM game is remembered even while its ROM is not imported.
  await remember('stuntcycle');
  await page.reload();
  await screen(page, 'title');
  await library.click();
  await screen(page, 'library');
  await expect(page.getByTestId('game-stuntcycle')).toBeFocused();
  // A remembered game that is unknown or not playable in this build is ignored
  // without disturbing the saved settings.
  for (const stale of ['antiaircraft', 'bogus', 7]) {
    await remember(stale);
    await page.reload();
    await screen(page, 'title');
    await expect(library).toBeFocused();
    await expect(library).toHaveClass(/primary-button/);
    await library.click();
    await screen(page, 'library');
    await expect(page.locator('.library-game').first()).toBeFocused();
    await expect(page.locator('.library-game').first()).toHaveAttribute('data-game-id', 'pong');
    await page.getByTestId('back').click();
    await titleSettings(page);
    await expect(page.getByTestId('preferences-status')).toHaveText('Settings are saved on this device.');
    await expect(page.locator('#volume')).toHaveValue('50');
  }
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

test('Home and Play stay simple and usable on phone-sized windows (layout only)', async ({ page }) => {
  // Phone portrait and landscape layouts; touch play itself remains deferred.
  const noOverflow = async (label: string) => {
    await expectViewportShell(page);
    const card = await page.locator('.overlay-card').evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(card.scroll, `${label} must not scroll sideways`).toBeLessThanOrEqual(card.client + 1);
  };
  const inside = async (testId: string, minHeight: number) => {
    const target = page.getByTestId(testId);
    await expect(target, testId).toBeVisible();
    const bounds = (await target.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bounds.height + 0.001, testId).toBeGreaterThanOrEqual(minHeight);
    expect(bounds.x, testId).toBeGreaterThanOrEqual(-1);
    expect(bounds.y, testId).toBeGreaterThanOrEqual(-1);
    expect(bounds.x + bounds.width, testId).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y + bounds.height, testId).toBeLessThanOrEqual(viewport.height + 1);
  };
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('?debug');
    await screen(page, 'title');
    await noOverflow(`Home ${viewport.width}x${viewport.height}`);
    const pins = page.locator('[data-panel="title"] .pin');
    await expect(pins).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      const pin = pins.nth(index);
      await pin.scrollIntoViewIfNeeded();
      const bounds = (await pin.boundingBox())!;
      expect(bounds.height + 0.001, 'Menu pins are at least 44px tall').toBeGreaterThanOrEqual(44);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    await page.getByTestId('open-library').click();
    await screen(page, 'library');
    await noOverflow(`Play ${viewport.width}x${viewport.height}`);
    // The selected game's Play button is on screen and tappable without scrolling.
    await inside('play-preview', 44);
    await page.getByTestId('play-preview').click({ trial: true });
    for (const id of ['game-pong', 'game-indy4', 'game-steeplechase']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      const bounds = (await page.getByTestId(id).boundingBox())!;
      expect(bounds.height + 0.001, `${id} is at least 44px tall`).toBeGreaterThanOrEqual(44);
      await page.getByTestId(id).click({ trial: true });
    }
    await inside('play-preview', 44);
    await page.getByTestId('back').click();
    for (const name of ['Settings', 'How to play', 'About']) {
      await page.getByRole('button', { name, exact: true }).click();
      await noOverflow(`${name} ${viewport.width}x${viewport.height}`);
      await page.getByTestId('back').click();
      await screen(page, 'title');
    }
  }
});
