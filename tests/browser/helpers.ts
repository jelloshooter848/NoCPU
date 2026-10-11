// SPDX-License-Identifier: GPL-3.0-or-later
// Shared black-box circuit/UI observations; never inject emulator state.
import { expect, type Page, type TestInfo } from "@playwright/test";

export type Snapshot = {
  timeps: string; frame: number; hits: number; scores: [number, number];
  run: boolean; attract: boolean; axes: [number, number]; coin: boolean;
  heldKeys: string[]; pointerCount: number; paused: boolean;
};

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const debug = (window as any).__nocpuDebug;
    if (!debug?.snapshot) throw new Error('Read-only circuit observation is unavailable');
    const state = await debug.snapshot();
    return {
      timeps: state.timePs, frame: state.frame, hits: state.hits, scores: state.scores,
      run: state.runN === 0, attract: state.attractN === 0,
      axes: [state.inputs.paddle1, state.inputs.paddle2], coin: state.inputs.coin !== 0,
      heldKeys: state.heldKeys, pointerCount: state.pointerCount, paused: state.paused,
    };
  });
}

export async function waitSimulation(page: Page, target: bigint): Promise<void> {
  await expect.poll(async () => BigInt((await snapshot(page)).timeps) >= target,
    { timeout: 30_000 }).toBe(true);
}

export async function paddles(page: Page): Promise<[number, number]> {
  return page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const { width, height } = canvas;
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const visited = new Uint8Array(width * height);
    const components: { x: number; y: number; w: number; h: number; area: number }[] = [];
    for (let initial = 0; initial < width * height; initial += 1) {
      if (visited[initial] || rgba[initial * 4] < 150) continue;
      const stack = [initial]; visited[initial] = 1;
      let count = 0, sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
      while (stack.length) {
        const pixel = stack.pop()!;
        const x = pixel % width, y = Math.floor(pixel / width);
        count += 1; sx += x; sy += y;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const neighbors = [x ? pixel - 1 : -1, x + 1 < width ? pixel + 1 : -1,
          y ? pixel - width : -1, y + 1 < height ? pixel + width : -1];
        for (const next of neighbors) {
          if (next >= 0 && !visited[next] && rgba[next * 4] >= 150) {
            visited[next] = 1; stack.push(next);
          }
        }
      }
      components.push({ x: sx / count / width, y: sy / count / height,
        w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height, area: count });
    }
    const choose = (left: boolean): number => {
      const candidates = components.filter((part) => part.x > (left ? 0.07 : 0.70)
        && part.x < (left ? 0.25 : 0.92) && part.w < 0.03 && part.h > 0.035 && part.h < 0.25);
      candidates.sort((a, b) => b.area - a.area);
      if (!candidates.length) throw new Error(`No rendered ${left ? 'left' : 'right'} paddle`);
      return candidates[0].y;
    };
    return [choose(true), choose(false)];
  });
}

export async function initialRenderedPaddles(page: Page): Promise<[number, number]> {
  let rendered: [number, number] | undefined;
  // Circuit telemetry can precede presentation of the first gameplay frame.
  // Require both actual rendered components before capturing the pixel baseline.
  await expect.poll(async () => {
    try {
      rendered = await paddles(page);
      return true;
    } catch (error) {
      if (!(error instanceof Error) || !/No rendered (left|right) paddle/.test(error.message)) throw error;
      return false;
    }
  }, { timeout: 10_000, message: 'Both original circuit paddles must appear in the rendered gameplay frame' }).toBe(true);
  return rendered!;
}

export async function settledReleasedPaddles(page: Page, slot: number): Promise<[number, number]> {
  const released = await snapshot(page);
  await waitSimulation(page, BigInt(released.timeps) + 50_000_000_000n);
  expect((await snapshot(page)).axes[slot], 'Released keyboard input must stop native axis movement').toBe(released.axes[slot]);
  // The worker clock runs independently of presentation. Allow a frame request
  // and its next presentation after the original input polling has settled.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect((await snapshot(page)).axes[slot]).toBe(released.axes[slot]);
  return paddles(page);
}

export async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as any;
    const NativeAudioContext = target.AudioContext || target.webkitAudioContext;
    target.__audioProbe = { contexts: [], gains: [], started: 0, stopped: 0, samples: 0, nonzero: 0, transitions: 0 };
    if (!NativeAudioContext) return;
    // Patch native prototypes: Firefox's WebIDL constructors can return a
    // native instance whose methods bypass a derived JavaScript prototype.
    const createGain = NativeAudioContext.prototype.createGain;
    NativeAudioContext.prototype.createGain = function (): GainNode {
      const gain = createGain.call(this); target.__audioProbe.gains.push(gain); return gain;
    };
    const createBufferSource = NativeAudioContext.prototype.createBufferSource;
    NativeAudioContext.prototype.createBufferSource = function (): AudioBufferSourceNode {
      const source = createBufferSource.call(this);
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        const data = source.buffer?.getChannelData(0);
        target.__audioProbe.started += 1;
        if (data) {
          target.__audioProbe.samples += data.length;
          for (let i = 0; i < data.length; i += 1) {
            if (data[i] !== 0) target.__audioProbe.nonzero += 1;
            if (i && data[i] !== data[i - 1]) target.__audioProbe.transitions += 1;
          }
        }
        return start(...args);
      };
      source.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => {
        target.__audioProbe.stopped += 1; return stop(...args);
      };
      return source;
    };
    class ObservedAudioContext extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options); target.__audioProbe.contexts.push(this);
      }
    }
    target.AudioContext = ObservedAudioContext;
    if (target.webkitAudioContext) target.webkitAudioContext = ObservedAudioContext;
  });
}

export async function start(page: Page): Promise<void> {
  await page.goto('./?debug');
  await page.getByTestId('play-pong').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await waitSimulation(page, 800_000_000_000n);
}

// Follow the game-shell UI rather than clicking controls hidden in submenus.
export async function pauseMenu(page: Page): Promise<void> {
  if (!(await snapshot(page)).paused) await page.getByTestId('pause').click();
  if (await page.getByTestId('back').isVisible()) await page.getByTestId('back').click();
  await expect(page.getByTestId('resume')).toBeVisible();
}

export async function resumePlay(page: Page): Promise<void> {
  if (await page.getByTestId('back').isVisible()) await page.getByTestId('back').click();
  await page.getByTestId('resume').click();
}

export async function togglePause(page: Page): Promise<void> {
  if ((await snapshot(page)).paused) await resumePlay(page);
  else await page.getByTestId('pause').click();
}

export async function openSettings(page: Page): Promise<void> {
  await pauseMenu(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#volume')).toBeVisible();
}

export async function openAbout(page: Page): Promise<void> {
  if (!(await page.getByRole('button', { name: 'About', exact: true }).isVisible())) await pauseMenu(page);
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByTestId('version')).toBeVisible();
}

export async function expectViewportShell(page: Page): Promise<void> {
  const documentBounds = await page.evaluate(() => {
    window.scrollTo({ top: 9999, left: 9999, behavior: 'instant' });
    return {
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollX, scrollY,
    };
  });
  expect(documentBounds.scrollWidth).toBeLessThanOrEqual(documentBounds.width + 1);
  expect(documentBounds.scrollHeight).toBeLessThanOrEqual(documentBounds.height + 1);
  expect(documentBounds.scrollX, 'The game shell must not scroll horizontally').toBe(0);
  expect(documentBounds.scrollY, 'The game shell must not scroll vertically').toBe(0);
}

export async function expectUsableTarget(page: Page, testId: string, namedButton = false): Promise<void> {
  const target = namedButton ? page.getByRole('button', { name: testId, exact: true }) : page.getByTestId(testId);
  const bounds = await target.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds, testId).not.toBeNull();
  // Firefox can report a CSS 44px edge as 43.9999847px. This arithmetic
  // tolerance is a thousandth of a pixel, not a smaller touch-target policy.
  expect(bounds!.width + 0.001, testId).toBeGreaterThanOrEqual(44);
  expect(bounds!.height + 0.001, testId).toBeGreaterThanOrEqual(44);
  expect(bounds!.x, testId).toBeGreaterThanOrEqual(-1);
  expect(bounds!.y, testId).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width, testId).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height, testId).toBeLessThanOrEqual(viewport.height + 1);
}

export type Bounds = { x: number; y: number; width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
export const noInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export function separation(a: Bounds, b: Bounds): number {
  return Math.max(a.x - b.x - b.width, b.x - a.x - a.width,
    a.y - b.y - b.height, b.y - a.y - a.height);
}

export async function controlBounds(page: Page, slot: number): Promise<{ pad: Bounds; track: Bounds; thumb: Bounds }> {
  const control = page.getByTestId(`paddle-p${slot + 1}`);
  const [pad, track, thumb] = await Promise.all([control.boundingBox(),
    control.locator('.control-track').boundingBox(), control.locator('.control-thumb').boundingBox()]);
  expect(pad).not.toBeNull(); expect(track).not.toBeNull(); expect(thumb).not.toBeNull();
  return { pad: pad!, track: track!, thumb: thumb! };
}

export async function expectThumbFraction(page: Page, slot: number, fraction: number): Promise<void> {
  await expect.poll(async () => {
    const { track, thumb } = await controlBounds(page, slot);
    return Math.abs(thumb.y + thumb.height / 2 - (track.y + track.height * fraction));
  }, { message: 'The visible thumb center follows the actual track travel' }).toBeLessThanOrEqual(2);
  await expect(page.getByTestId(`paddle-p${slot + 1}`)).toHaveAttribute('aria-valuenow', String(Math.round(fraction * 100)));
}

export async function settleInputPresentation(page: Page): Promise<void> {
  const before = await snapshot(page);
  await waitSimulation(page, BigInt(before.timeps) + 50_000_000_000n);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect((await snapshot(page)).frame).toBeGreaterThan(before.frame);
}

export async function expectExternalLayout(page: Page, insets: Insets = noInsets): Promise<unknown> {
  const viewport = page.viewportSize()!;
  const canvas = (await page.getByTestId('game-canvas').boundingBox())!;
  expect(canvas).not.toBeNull();
  const controls = await Promise.all([controlBounds(page, 0), controlBounds(page, 1)]);
  const wrappers = await page.locator('.paddle-controller').evaluateAll((elements) => elements.filter((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  }).map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(wrappers).toHaveLength(2);
  const hud = (await page.locator('.game-hud').boundingBox())!;
  expect(hud).not.toBeNull();
  const landscape = viewport.width > viewport.height;
  for (let slot = 0; slot < 2; slot += 1) {
    const { pad, track } = controls[slot];
    const id = `paddle-p${slot + 1}`;
    await expect(page.getByTestId(id)).toHaveAccessibleName(`Player ${slot + 1} paddle position`);
    const label = page.locator(`#paddle-p${slot + 1}-label`);
    await expect(label).toHaveText(`P${slot + 1}`);
    await expect(label).toBeVisible();
    expect(pad.width + 0.001, `${id} has a visible, usable external target`).toBeGreaterThanOrEqual(64);
    const compact = viewport.width <= 360 || viewport.height <= 620;
    expect(track.height + 0.001, `${id} has real vertical travel`).toBeGreaterThanOrEqual(compact ? 120 : 144);
    expect(separation(pad, canvas) + 0.001, `${id} cannot cover the court`).toBeGreaterThanOrEqual(8);
    expect(track.x).toBeGreaterThanOrEqual(pad.x - 0.001);
    expect(track.y).toBeGreaterThanOrEqual(pad.y - 0.001);
    expect(track.x + track.width).toBeLessThanOrEqual(pad.x + pad.width + 0.001);
    expect(track.y + track.height).toBeLessThanOrEqual(pad.y + pad.height + 0.001);
    if (landscape) {
      expect(wrappers[slot].width, 'Side controllers have a bounded width').toBeLessThanOrEqual(96.001);
      if (!slot) expect(pad.x + pad.width + 8).toBeLessThanOrEqual(canvas.x + 0.001);
      else expect(pad.x).toBeGreaterThanOrEqual(canvas.x + canvas.width + 8 - 0.001);
    } else {
      expect(wrappers[slot].height, 'The portrait controller row has a bounded height').toBeLessThanOrEqual(204.001);
      expect(pad.y).toBeGreaterThanOrEqual(canvas.y + canvas.height + 8 - 0.001);
    }
    // Browser hit-testing proves that the displayed target receives input.
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="slider"]')?.getAttribute('data-testid'),
      { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 })).toBe(id);
  }
  expect(separation(controls[0].pad, controls[1].pad)).toBeGreaterThanOrEqual(8);
  for (const [name, bounds] of [['court', canvas], ['HUD', hud], ...wrappers.map((bounds, slot) => [`P${slot + 1} controller`, bounds])] as [string, Bounds][]) {
    expect(bounds.x, `${name} respects the left safe area`).toBeGreaterThanOrEqual(insets.left - 0.001);
    expect(bounds.y, `${name} respects the top safe area`).toBeGreaterThanOrEqual(insets.top - 0.001);
    expect(bounds.x + bounds.width, `${name} respects the right safe area`).toBeLessThanOrEqual(viewport.width - insets.right + 0.001);
    expect(bounds.y + bounds.height, `${name} respects the bottom safe area`).toBeLessThanOrEqual(viewport.height - insets.bottom + 0.001);
  }
  // Compute the largest 4:3 court from visible control reservations, not the
  // implementation's CSS sizing formula or the previous overlay-pad budget.
  const availableWidth = viewport.width - insets.left - insets.right
    - (landscape ? wrappers[0].width + wrappers[1].width + 16 : 0);
  const availableHeight = viewport.height - insets.top - insets.bottom - hud.height - 16
    - (landscape ? 0 : Math.max(...wrappers.map((bounds) => bounds.height)) + 8);
  expect(canvas.width / canvas.height).toBeCloseTo(4 / 3, 2);
  expect(canvas.width, 'Court maximizes the usable area after external controls').toBeGreaterThanOrEqual(Math.min(availableWidth, availableHeight * 4 / 3) * 0.9);
  // The court itself is an unobstructed raster throughout its hit-test area.
  for (const fx of [0.05, 0.5, 0.95]) for (const fy of [0.05, 0.5, 0.95]) {
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      { x: canvas.x + canvas.width * fx, y: canvas.y + canvas.height * fy })).toBe('CANVAS');
  }
  return { viewport, simulatedSafeInsets: insets, canvas, controls, wrappers, hud };
}

export async function captureShellPanel(page: Page, testInfo: TestInfo, state: string): Promise<void> {
  const original = page.viewportSize()!;
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath(`shell-${state}.png`) });
  await page.setViewportSize({ width: 844, height: 390 });
  await expectViewportShell(page);
  await page.screenshot({ path: testInfo.outputPath(`shell-${state}-landscape.png`) });
  await page.setViewportSize(original);
}
