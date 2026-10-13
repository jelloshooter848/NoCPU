// SPDX-License-Identifier: GPL-3.0-or-later
// Actual player-ROM launch tests require ignored private fixtures. Public CI
// explicitly skips them; synthetic matching CRCs cannot prove gameplay.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importZip, titleSettings, installGamepads, padState } from './app-helpers';

// Trace network/action logs can serialize file-input payloads; private fixtures
// must never enter retained traces or reports. Screenshots contain raster only.
test.use({ trace: 'off', video: 'off' });

const privateDir = process.env.NOCPU_ROM_DIR;
async function launch(page: Page, id: string): Promise<void> {
  await page.goto('./?debug');
  await titleSettings(page);
  await importZip(page, id, `${id}.zip`, readFileSync(join(privateDir!, id === 'stuntcycle' ? 'stuntcyc.zip' : 'indy4.zip')));
  await expect(page.getByTestId('rom-import-status')).toContainText('ROM validated');
  await page.getByTestId('back').click();
  await page.getByTestId('open-library').click();
  await page.getByTestId(`game-${id}`).click();
  await page.getByTestId('play-selected').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
}
// Original exploratory full-RGB pilot frame100 (1684482877120ps), also
// frames200/300: the measured four car colors and white track. This asserts
// color preservation, not an exact frame or final native/Wasm parity gate.
const originalIndyPalette = ['0,0,0', '0,230,250', '0,251,0', '220,0,0', '220,0,250', '220,230,230'];
async function rasterColors(page: Page): Promise<string[]> {
  return page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let i = 0; i < rgba.length; i += 4) colors.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
    return [...colors];
  });
}
async function state(page: Page): Promise<any> {
  return page.evaluate(async () => (window as any).__nocpuDebug.snapshot());
}
// Waits for original-circuit behavior are bounded in simulated time, like the
// Stunt score test below. The worker paces against wall time but runs slower
// than real time when the host cannot keep up: Playwright's own Firefox build
// runs this Wasm core about five times slower than release Firefox or
// Chromium, so a wall-clock poll measured the host, not the circuit. The
// wall-clock timeout is only a backstop for a stalled simulation.
async function untilCircuit(page: Page, predicate: (snapshot: any) => boolean, simulatedSeconds: number, timeout = 120_000): Promise<any> {
  const limit = BigInt((await state(page)).timePs) + BigInt(simulatedSeconds * 1000) * 1_000_000_000n;
  let snapshot: any;
  await expect.poll(async () => {
    snapshot = await state(page);
    return predicate(snapshot) || BigInt(snapshot.timePs) >= limit;
  }, { timeout }).toBe(true);
  return snapshot;
}

for (const id of ['stuntcycle', 'indy4']) {
  test(`${id} missing ROM launch stays recoverable and explains import`, async ({ page }) => {
    await page.goto('./?debug'); await page.getByTestId('open-library').click();
    await page.getByTestId(`game-${id}`).click();
    await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
    await page.getByTestId('play-selected').click();
    await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'game-info');
    await expect(page.getByTestId('rom-launch-message')).toBeVisible();
    await expect(page.getByTestId('game-audio-status')).toContainText('unavailable');
  });
  test(`${id} private ROM keyboard and mouse controls, silent lifecycle and original raster`, async ({ page }, testInfo) => {
    test.skip(!privateDir, 'Private original ROM fixture directory is unavailable; gameplay not exercised.');
    // Indy 4 needs about 30 simulated seconds here (each car joins about 6.4 s
    // after its coin); allow hosts that simulate at a quarter of real time.
    test.setTimeout(240_000);
    await installGamepads(page);
    await page.addInitScript(() => {
      const w = window as any, original = Worker.prototype.postMessage;
      w.__drivingCommands = [];
      Worker.prototype.postMessage = function (message: any, ...args: any[]) {
        // Record inputs only: never copy private init buffers into diagnostics.
        if (['coin', 'start', 'inputs', 'keys', 'buttons', 'reset', 'release'].includes(message.type)) w.__drivingCommands.push(structuredClone(message));
        return Reflect.apply(original, this, [message, ...args]);
      };
    });
    await launch(page, id);
    const cold = await state(page); expect(cold.gameId).toBe(id);
    // The original constructor's silent GND initialization sample is verified
    // separately by ABI/media probes. Here compare ongoing post-constructor
    // epochs instead of falsely requiring zero total generated samples.
    await expect.poll(async () => BigInt((await state(page)).timePs) >= 1000000000000n, { timeout: 30_000 }).toBe(true);
    const postConstructorAudio = (await state(page)).audio.generatedSamples;
    await expect(page.getByTestId('game-canvas')).toBeVisible();
    await expect(page.getByTestId('mute')).toHaveText('No DICE audio');
    await expect(page.getByTestId('mute')).toBeDisabled();
    const raster = await page.getByTestId('game-canvas').boundingBox(); expect(raster).not.toBeNull();
    const hud = await page.locator('.game-hud').boundingBox(); expect(hud).not.toBeNull();
    expect(raster!.y + raster!.height, 'The action bar stays outside the raster').toBeLessThanOrEqual(hud!.y + .001);
    await testInfo.attach(`${id}-playing-viewport.png`, { body: await page.screenshot(), contentType: 'image/png' });
    if (id === 'indy4') {
      await expect.poll(() => rasterColors(page)).toEqual(expect.arrayContaining(originalIndyPalette));
      await expect(page.getByTestId('start-game')).toBeHidden();
      for (const channel of [2, 3, 4, 5]) await expect(page.getByTestId(`coin-channel-${channel}`)).toBeVisible();
      await page.keyboard.down('ArrowUp');
      await page.keyboard.down('KeyK');
      await expect.poll(async () => (await state(page)).driving.gas).toEqual([false, true, false, false]);
      await expect.poll(async () => (await state(page)).driving.brake).toEqual([false, false, true, false]);
      await expect.poll(async () => (await state(page)).heldKeys).toContain('KeyK');
      // The wheel game has no mouse mapping: mouse movement and clicks change nothing.
      await page.mouse.move(raster!.x + raster!.width * .2, raster!.y + raster!.height * .5);
      await page.mouse.down(); await page.mouse.move(raster!.x + raster!.width * .8, raster!.y + raster!.height * .5, { steps: 3 }); await page.mouse.up();
      expect((await state(page)).pointerCount).toBe(0);
      expect((await state(page)).driving.directions).toEqual([0, 0, 0, 0]);
      await page.keyboard.up('ArrowUp');
      await page.keyboard.up('KeyK');
      await expect.poll(async () => (await state(page)).driving.gas.some(Boolean)).toBe(false);
      await expect.poll(async () => (await state(page)).driving.brake.some(Boolean)).toBe(false);
      await padState(page, 0, { axis: [0, 0] });
      await padState(page, 0, { axis: [0, 1] });
      await expect.poll(async () => (await state(page)).driving.axes[0]).toBe(32767);
      await page.keyboard.down('KeyA');
      await expect.poll(async () => (await state(page)).driving.directions[0]).toBe(-1);
      await padState(page, 0, { axis: [0, -1] });
      await page.keyboard.up('KeyA');
      await expect.poll(async () => (await state(page)).driving.directions[0]).toBe(0);
      await expect.poll(async () => (await state(page)).driving.axes[0]).toBe(-32768);
      for (const code of ['KeyA', 'ArrowRight', 'KeyJ', 'Numpad6', 'KeyW', 'ArrowUp', 'KeyI', 'Numpad8']) await page.keyboard.down(code);
      await expect.poll(async () => (await state(page)).driving.directions).toEqual([-1, 1, -1, 1]);
      await expect.poll(async () => (await state(page)).driving.gas).toEqual([true, true, true, true]);
      for (const code of ['KeyA', 'ArrowRight', 'KeyJ', 'Numpad6', 'KeyW', 'ArrowUp', 'KeyI', 'Numpad8']) await page.keyboard.up(code);
      await expect.poll(async () => (await state(page)).driving.gas.some(Boolean)).toBe(false);
      const targets = ['insert-coin', 'coin-channel-2', 'coin-channel-3', 'coin-channel-4', 'coin-channel-5'];
      for (let channel = 1; channel <= 5; channel++) {
        const completed = (await state(page)).switches.coinCompleted[channel - 1];
        await page.getByTestId(targets[channel - 1]).click();
        // Counts advance only after an accepted native channel held for the
        // full100ms simulation pulse and successful release, never a request.
        const pulsed = await untilCircuit(page, (s) => s.switches.coinCompleted[channel - 1] === completed + 1, 2);
        expect(pulsed.switches.coinCompleted[channel - 1]).toBe(completed + 1);
        expect((await state(page)).coinChannel).toBe(null);
        // The original COIN.F4 attract latch for that car drops when it joins,
        // about 6.4 simulated seconds after the coin.
        if (channel <= 4) expect((await untilCircuit(page, (s) => s.indy4.cars[channel - 1][0] === 0, 10)).indy4.cars[channel - 1][0], `car ${channel} joins within 10 simulated seconds`).toBe(0);
      }
      await page.keyboard.down('KeyW');
      expect((await untilCircuit(page, (s) => s.indy4.cars[0][3] > 0, 10)).indy4.cars[0][3]).toBeGreaterThan(0);
      await page.keyboard.up('KeyW');
      // The unchanged analog rate must resume after an opposite digital hold.
      await padState(page, 0, { axis: [0, 1] });
      await page.keyboard.down('KeyA'); await page.keyboard.up('KeyA');
      const heading = (await state(page)).indy4.cars[0][2];
      expect((await untilCircuit(page, (s) => s.indy4.cars[0][2] !== heading, 10)).indy4.cars[0][2]).not.toBe(heading);
      expect((await state(page)).switches.coinCompleted).toEqual([1, 1, 1, 1, 1]);
      expect(await page.evaluate(() => (window as any).__drivingCommands.filter((c: any) => c.type === 'coin').map((c: any) => c.channel))).toEqual([1, 2, 3, 4, 5]);
      await page.getByTestId('pause').click();
      await expect.poll(async () => (await state(page)).pointerCount).toBe(0);
    } else {
      await expect(page.getByTestId('start-game')).toHaveText('Start 1P');
      await expect(page.getByTestId('start-game-2')).toHaveText('Start 2P');
      // Hovering never opens the throttle; the held left button over the display
      // sets it from idle (left edge) to full (right edge) and releasing idles it.
      const y = raster!.y + raster!.height / 2;
      await page.mouse.move(raster!.x + raster!.width * .8, y); await page.mouse.move(raster!.x + raster!.width * .9, y);
      expect((await state(page)).driving.axes[0]).toBe(0);
      await page.mouse.move(raster!.x + 2, y); await page.mouse.down();
      await expect.poll(async () => (await state(page)).pointerCount).toBe(1);
      expect((await state(page)).driving.axes[0]).toBe(0);
      await page.mouse.move(raster!.x + raster!.width - 2, y);
      await expect.poll(async () => (await state(page)).driving.axes[0]).toBe(32767);
      await expect.poll(async () => (await state(page)).stuntcycle.throttle).toBeGreaterThan(0);
      await page.mouse.up();
      await expect.poll(async () => (await state(page)).driving.axes[0]).toBe(0);
      expect((await state(page)).pointerCount).toBe(0);
      await page.getByTestId('game-canvas').focus();
      await page.keyboard.down('KeyW');
      await expect.poll(async () => (await state(page)).stuntcycle.throttle).toBeGreaterThan(90000);
      const heldThrottle = (await state(page)).stuntcycle.throttle;
      await page.keyboard.up('KeyW');
      await expect.poll(async () => { const throttle = (await state(page)).stuntcycle.throttle; return throttle > 0 && throttle < heldThrottle; }).toBe(true);
      await expect.poll(async () => (await state(page)).stuntcycle.throttle).toBe(0);
      await padState(page, 0, { axis: [1, 0] }); await padState(page, 0, { axis: [1, 1] });
      await expect.poll(async () => (await state(page)).stuntcycle.throttle).toBeGreaterThan(90000);
      await page.keyboard.down('KeyS');
      await expect.poll(async () => (await state(page)).stuntcycle.throttle).toBeLessThan(80000);
      await page.keyboard.up('KeyS');
      await expect.poll(async () => (await state(page)).stuntcycle.throttle).toBeGreaterThan(90000);
      await page.getByTestId('pause').click();
    }
    await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
    await page.getByTestId('resume').click();
    await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
    expect((await state(page)).identity.generation).toBe(cold.identity.generation);
    expect((await state(page)).audio.generatedSamples).toBe(postConstructorAudio);
    await page.getByTestId('pause').click();
    await page.getByTestId('reset').click();
    await expect.poll(async () => (await state(page)).identity.resetId).toBeGreaterThan(cold.identity.resetId);
    expect((await state(page)).gameOptions).toEqual(cold.gameOptions);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByTestId('settings-game').selectOption(id);
    const selected = id === 'stuntcycle'
      ? { misses: 7, freeGameScore: 27, coinage: 2, freeGame: false }
      : { playtimeOhms: 1220000 };
    if (id === 'stuntcycle') {
      await page.getByTestId('misses').selectOption('7');
      await page.getByTestId('free-game-score').selectOption('27');
      await page.getByTestId('coinage').selectOption('2');
      await page.getByTestId('free-game').selectOption('disabled');
    } else {
      await page.getByTestId('playtime').focus();
      await page.keyboard.press('End');
    }
    await page.getByTestId('apply-game-options').click();
    await expect.poll(async () => (await state(page)).gameOptions).toEqual(selected);
    await expect.poll(async () => (await state(page)).identity.resetting).toBe(false);
    expect((await state(page)).identity.generation).toBe(cold.identity.generation);
    await page.getByTestId(`remove-${id}`).click();
    await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'library');
    await page.getByTestId(`game-${id}`).click();
    await expect(page.getByTestId('play-selected')).toHaveText('Import ROMs to play');
    await page.getByTestId('back').click(); await page.getByTestId('game-pong').click();
    await page.getByTestId('play-selected').click();
    await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
    await expect(page.getByTestId('mute')).toBeEnabled();
    await expect(page.getByTestId('mute')).not.toHaveText('No DICE audio');
  });
}

for (const id of ['stuntcycle', 'indy4']) {
  test(`${id} player archive session, opt-in retention, backup, removal and re-import`, async ({ page }) => {
    test.skip(!privateDir, 'Private original ROM fixtures unavailable; selected archive lifecycle not exercised.');
    const bytes = readFileSync(join(privateDir!, id === 'stuntcycle' ? 'stuntcyc.zip' : 'indy4.zip'));
    await page.goto('./?debug'); await titleSettings(page);
    await importZip(page, id, `${id}.zip`, bytes);
    await expect(page.getByTestId(`rom-item-${id}`)).toContainText('Available this session');
    await page.reload(); await titleSettings(page);
    await expect(page.getByTestId(`rom-item-${id}`)).toHaveCount(0);
    await importZip(page, id, `${id}.zip`, bytes, true);
    await expect(page.getByTestId(`rom-item-${id}`)).toContainText('Saved on this device');
    await page.reload(); await titleSettings(page);
    await expect(page.getByTestId(`rom-item-${id}`)).toContainText('Saved on this device');
    const backup = page.waitForEvent('download');
    await page.getByTestId(`export-${id}`).click();
    const download = await backup;
    expect(download.suggestedFilename()).toBe(`${id}.zip`);
    // Read the browser download through its stream, never save ROM bytes as an artifact.
    const stream = await download.createReadStream(); expect(stream).not.toBeNull();
    const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const equal = Buffer.concat(chunks).equals(bytes);
    await download.delete();
    expect(equal).toBe(true);
    await page.getByTestId(`remove-${id}`).click();
    await expect(page.getByTestId(`rom-item-${id}`)).toHaveCount(0);
    await page.reload(); await titleSettings(page);
    await expect(page.getByTestId(`rom-item-${id}`)).toHaveCount(0);
    await importZip(page, id, `${id}.zip`, bytes);
    await expect(page.getByTestId(`rom-item-${id}`)).toContainText('Available this session');
    // A different game's real archive must fail validation, retaining the valid set.
    const other = readFileSync(join(privateDir!, id === 'stuntcycle' ? 'indy4.zip' : 'stuntcyc.zip'));
    await importZip(page, id, 'wrong-game.zip', other);
    await expect(page.getByTestId('rom-import-status')).not.toContainText('ROM validated');
    await expect(page.getByTestId(`rom-item-${id}`)).toContainText('Available this session');
  });
}

test('Indy four independent controllers preserve every steering/pedal slot and neutral rearm across suspension', async ({ page }) => {
  test.skip(!privateDir, 'Private original ROM fixtures unavailable; four-slot controls not exercised.');
  await installGamepads(page, 4); await launch(page, 'indy4');
  for (let slot = 0; slot < 4; slot++) await padState(page, slot, { axis: [0, 0] });
  for (let slot = 0; slot < 4; slot++) {
    await padState(page, slot, { axis: [0, slot % 2 ? 1 : -1] });
    await padState(page, slot, { button: [0, true] });
    await padState(page, slot, { button: [1, slot % 2 === 0] });
  }
  await expect.poll(async () => (await state(page)).driving.axes).toEqual([-32768, 32767, -32768, 32767]);
  await expect.poll(async () => (await state(page)).driving.gas).toEqual([true, true, true, true]);
  await expect.poll(async () => (await state(page)).driving.brake).toEqual([true, false, true, false]);
  await padState(page, 1, { connected: false });
  await expect.poll(async () => (await state(page)).driving.gas.some(Boolean)).toBe(false);
  await expect.poll(async () => (await state(page)).driving.brake.some(Boolean)).toBe(false);
  await expect.poll(async () => (await state(page)).driving.axes).toEqual([0, 0, 0, 0]);
  await padState(page, 1, { connected: true });
  await expect.poll(async () => (await state(page)).driving.gas.some(Boolean)).toBe(false);
  for (let slot = 0; slot < 4; slot++) {
    await padState(page, slot, { axis: [0, 0] });
    await padState(page, slot, { button: [0, false] });
    await padState(page, slot, { button: [1, false] });
  }
  for (let slot = 0; slot < 4; slot++) await padState(page, slot, { button: [0, true] });
  await expect.poll(async () => (await state(page)).driving.gas).toEqual([true, true, true, true]);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
  await expect.poll(async () => (await state(page)).driving.gas.some(Boolean)).toBe(false);
  await page.getByTestId('resume').click();
  await expect.poll(async () => (await state(page)).driving.gas.some(Boolean)).toBe(false);
  for (let slot = 0; slot < 4; slot++) await padState(page, slot, { button: [0, false] });
  await padState(page, 3, { button: [0, true] });
  await expect.poll(async () => (await state(page)).driving.gas).toEqual([false, false, false, true]);
  await page.getByTestId('pause').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('settings-game').selectOption('indy4');
  await page.getByTestId('binding-p4Gas').click(); await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('binding-p4Gas')).toHaveText('Q');
  await page.getByTestId('gamepad-p4-axis').selectOption('2');
  await page.getByTestId('gamepad-p4-pad').selectOption('0');
  await page.getByTestId('gamepad-p4-invert').check();
  await page.getByTestId('back').click(); await page.getByTestId('resume').click();
  await page.keyboard.down('Numpad8');
  await expect.poll(async () => (await state(page)).driving.gas.some(Boolean)).toBe(false);
  await page.keyboard.up('Numpad8'); await page.keyboard.down('KeyQ');
  await expect.poll(async () => (await state(page)).driving.gas).toEqual([false, false, false, true]);
  await page.keyboard.up('KeyQ');
  await padState(page, 0, { axis: [2, 0] }); await padState(page, 0, { axis: [2, -1] });
  await expect.poll(async () => (await state(page)).driving.axes).toEqual([0, 0, 0, 32767]);
});

test('Stunt source-derived Coin/Start1 and two-credit Start2 switches run the same shared throttle circuit', async ({ page }) => {
  test.skip(!privateDir, 'Private original ROM fixtures unavailable; Stunt credit/start circuit not exercised.');
  await launch(page, 'stuntcycle');
  await expect.poll(async () => (await state(page)).nativeRunning).toBe(false);
  async function coin(): Promise<void> {
    const completed = (await state(page)).switches.coinCompleted[0];
    await page.getByTestId('insert-coin').click();
    await expect.poll(async () => (await state(page)).switches.coinCompleted[0]).toBe(completed + 1);
    expect((await state(page)).coinChannel).toBe(null);
  }
  await coin();
  const start1Completed = (await state(page)).switches.startCompleted[0];
  await page.getByTestId('start-game').click();
  await expect.poll(async () => (await state(page)).switches.startCompleted[0]).toBe(start1Completed + 1);
  expect((await state(page)).inputs.start).toBe(0);
  await expect.poll(async () => (await state(page)).nativeRunning).toBe(true);
  const onePlayer = await state(page);
  expect(onePlayer.switches.coinCompleted).toEqual([1, 0, 0, 0, 0]);
  expect(onePlayer.switches.startCompleted).toEqual([1, 0]);
  expect(onePlayer.driving.axes).toHaveLength(1);
  await page.getByTestId('pause').click(); await page.getByTestId('reset').click();
  await expect.poll(async () => (await state(page)).identity.resetting).toBe(false);
  await expect.poll(async () => (await state(page)).identity.resetId).toBeGreaterThan(onePlayer.identity.resetId);
  expect((await state(page)).switches.coinCompleted).toEqual([0, 0, 0, 0, 0]);
  expect((await state(page)).switches.startCompleted).toEqual([0, 0]);
  await page.getByTestId('resume').click();
  await expect.poll(async () => (await state(page)).nativeRunning).toBe(false);
  // Original E8 upper credit bits gate H9.12 to set H8.5 two-player mode.
  // Default one-coin/one-credit needs two separate credits for that mode;
  // one-credit Start2 may still start 1P, so never assert that it cannot run.
  await coin(); await coin();
  const start2Completed = (await state(page)).switches.startCompleted[1];
  await page.getByTestId('start-game-2').click();
  await expect.poll(async () => (await state(page)).switches.startCompleted[1]).toBe(start2Completed + 1);
  expect((await state(page)).inputs.start).toBe(0);
  await expect.poll(async () => (await state(page)).nativeRunning).toBe(true);
  expect((await state(page)).driving.axes).toHaveLength(1);
  expect((await state(page)).switches.coinCompleted).toEqual([2, 0, 0, 0, 0]);
  expect((await state(page)).switches.startCompleted).toEqual([0, 1]);
  expect((await state(page)).identity.generation).toBe(onePlayer.identity.generation);
  // This checks full native coin/start pulses, credit setup and running circuit.
  // PLAYER_CONTROL is H8.5 & miss-LSB, so it cannot certify raw mode/turn
  // alternation here. Direct H8.5/native alternating-turn evidence is separate.
});


test('Stunt measured20% throttle produces original raw8-to9 score progression in browser software', async ({ page }, testInfo) => {
  test.skip(!privateDir, 'Private original ROM fixtures unavailable; representative Stunt gameplay not exercised.');
  test.setTimeout(90_000);
  await installGamepads(page); await launch(page, 'stuntcycle');
  await padState(page, 0, { axis: [1, 0] });
  const cold = await state(page);
  expect(cold.scores[0]).toBe(8); expect(cold.nativeRunning).toBe(false);
  const coins = cold.switches.coinCompleted[0];
  await page.getByTestId('insert-coin').click();
  await expect.poll(async () => (await state(page)).switches.coinCompleted[0]).toBe(coins + 1);
  const starts = (await state(page)).switches.startCompleted[0];
  await page.getByTestId('start-game').click();
  await expect.poll(async () => (await state(page)).switches.startCompleted[0]).toBe(starts + 1);
  await expect.poll(async () => (await state(page)).nativeRunning).toBe(true);
  // Source-derived original successful replay uses positiveaxis6554 (~20%).
  // Browser default deadzone0.15 scales the synthetic platform joystick;
  // choose its raw value to deliver that exact core axis and assert delivery.
  // This live-browser smoke is not an exact-time native/Wasm replay comparison.
  const rawAxis = 0.15 + 0.85 * (6554 / 32767);
  await padState(page, 0, { axis: [1, rawAxis] });
  await expect.poll(async () => (await state(page)).driving.axes[0]).toBe(6554);
  let outcome: any;
  await expect.poll(async () => {
    outcome = await state(page);
    return outcome.scores[0] === 9 || BigInt(outcome.timePs) >= 20_000_000_000_000n;
  }, { timeout: 60_000 }).toBe(true);
  expect(outcome.scores[0], 'Original score must progress from its real loaded8 to9 within20 simulated seconds').toBe(9);
  expect(outcome.nativeRunning).toBe(true);
  expect(outcome.stuntcycle.signals[5], 'Source BAD_JUMP is inactive at the scored observation').toBe(0);
  expect(outcome.identity.generation).toBe(cold.identity.generation);
  await testInfo.attach('stunt-original-score9-software.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('stunt-original-score9-software.json', { body: Buffer.from(JSON.stringify({
    scope: 'Actual browser software original raw score progression; synthetic platform joystick; no physical-device or exact native-replay claim',
    axis: 6554, initialRawScore: cold.scores[0], rawScore: outcome.scores[0], timePs: outcome.timePs,
    gameOptions: outcome.gameOptions, nativeRunning: outcome.nativeRunning, currentBadJump: outcome.stuntcycle.signals[5],
  }, null, 2)), contentType: 'application/json' });
});
