// SPDX-License-Identifier: GPL-3.0-or-later
// Original-pilot-derived Breakout observations; no native state/media injection.
import { expect, type Page } from '@playwright/test';
import type { BreakoutOptions } from '../../web/src/game-contract';
import type { Bounds, Insets } from './helpers';

export interface BreakoutObservation {
  gameId: string; options: BreakoutOptions; generation: number; resetId: number; clockEpoch: number;
  timeps: string; frame: number; run: boolean; attract: boolean; axes: number[]; directions: number[];
  coin: boolean; start: boolean; startPlayer: 1 | 2 | null; startsQueued: number; serve: boolean;
  heldKeys: string[]; pointerCount: number; paused: boolean; scores: number[]; hits: number | null;
  display: { width: number; height: number; pixelFormat: string }; raw: Record<string, number> | null;
  audio: { generatedSamples: number; scheduledSamples: number; queueDepth: number; [key: string]: unknown };
}
export async function breakoutSnapshot(page: Page): Promise<BreakoutObservation> {
  return page.evaluate(async () => {
    const s = await (window as any).__nocpuDebug.snapshot();
    return { gameId: s.gameId, options: s.gameOptions, generation: s.identity.generation,
      resetId: s.identity.resetId, clockEpoch: s.identity.clockEpoch, timeps: s.timePs, frame: s.frame,
      run: s.nativeRunning, attract: s.attractN === 0, axes: [s.inputs.paddle1], directions: s.inputs.directions,
      coin: !!s.inputs.coin, start: !!s.inputs.start, startPlayer: s.inputs.startPlayer,
      startsQueued: s.inputs.startsQueued, serve: !!s.inputs.serve, heldKeys: s.heldKeys,
      pointerCount: s.pointerCount, paused: s.paused, scores: s.scores, hits: s.hits,
      display: s.display, raw: s.breakout, audio: s.audio };
  });
}
export async function breakoutAdvance(page: Page, microseconds: number): Promise<void> {
  const from = BigInt((await breakoutSnapshot(page)).timeps);
  await expect.poll(async () => BigInt((await breakoutSnapshot(page)).timeps) >= from + BigInt(microseconds) * 1_000_000n,
    { timeout: 30_000 }).toBe(true);
}
export async function breakoutPause(page: Page): Promise<void> {
  if (!(await breakoutSnapshot(page)).paused) await page.getByTestId('pause').click();
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'paused');
}
export async function launchBreakout(page: Page): Promise<void> {
  await page.goto('./?debug'); await page.getByTestId('open-library').click();
  await page.getByTestId('game-breakout').click(); await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect.poll(async () => (await breakoutSnapshot(page)).gameId).toBe('breakout');
  await expect.poll(async () => BigInt((await breakoutSnapshot(page)).timeps) >= 800_000_000_000n).toBe(true);
}
export async function startBreakout(page: Page, player: 1 | 2 = 1): Promise<void> {
  await page.getByTestId('insert-coin').click();
  if (player === 2) await page.getByTestId('insert-coin').click();
  await page.getByTestId(player === 1 ? 'start-game' : 'start-game-2').click();
  await expect.poll(async () => (await breakoutSnapshot(page)).run, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => !(await breakoutSnapshot(page)).start).toBe(true);
  await breakoutAdvance(page, 100000);
}
export async function breakoutRaster(page: Page): Promise<{ width: number; height: number; colors: string[]; paddle: Bounds }> {
  return page.getByTestId('game-canvas').evaluate((element) => {
    const c = element as HTMLCanvasElement;
    if (c.width !== 324 || c.height !== 432) throw new Error('Breakout must retain the measured original cropped portrait raster.');
    const rgba = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const palette = new Set<string>();
    for (let offset = 0; offset < rgba.length; offset += 4) {
      if (rgba[offset] || rgba[offset + 1] || rgba[offset + 2]) palette.add(`${rgba[offset]},${rgba[offset + 1]},${rgba[offset + 2]}`);
    }
    // Original RGB pilot: paddle cyan (10,133,194), y382..388. Crop
    // fixed wall columns0..4/293..297 so authentic endpoint wall merges
    // do not turn a paddle into the full-height boundary component.
    // The overlay also colors a ball that crosses this band. Isolate connected
    // components and require the original seven-row paddle, never a combined
    // bounding box around disconnected ball/paddle pixels. Fixed row clipping
    // preserves a real paddle/ball contact without adding an imaginary paddle.
    const visited = new Uint8Array(c.width * c.height), candidates: Bounds[] = [];
    const cyan = (pixel: number) => rgba[pixel * 4] === 10 && rgba[pixel * 4 + 1] === 133 && rgba[pixel * 4 + 2] === 194;
    for (let y = 382; y <= 388; y++) for (let x = 5; x <= 292; x++) {
      const first: number = y * c.width + x; if (visited[first] || !cyan(first)) continue;
      const queue: number[] = [first]; visited[first] = 1; let xmin = x, xmax = x, ymin = y, ymax = y, count = 0;
      while (queue.length) {
        const pixel: number = queue.pop()!, px: number = pixel % c.width, py: number = Math.floor(pixel / c.width); count++;
        xmin = Math.min(xmin, px); xmax = Math.max(xmax, px); ymin = Math.min(ymin, py); ymax = Math.max(ymax, py);
        for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
          const nx: number = px + dx, ny: number = py + dy, next: number = ny * c.width + nx;
          if ((dx || dy) && nx >= 5 && nx <= 292 && ny >= 382 && ny <= 388 && !visited[next] && cyan(next)) { visited[next] = 1; queue.push(next); }
        }
      }
      const width = xmax - xmin + 1, height = ymax - ymin + 1;
      if (width >= 1 && width <= 28 && ymin === 382 && height === 7 && count >= 7) candidates.push({ x: xmin, y: ymin, width, height });
    }
    if (!candidates.length) throw new Error('Original cyan paddle is not yet present in its measured native row.');
    if (candidates.length !== 1) throw new Error('Native row contains more than one original-shaped paddle candidate.');
    return { width: c.width, height: c.height, colors: [...palette].sort(), paddle: candidates[0] };
  });
}
export async function visibleBreakoutRaster(page: Page): Promise<Awaited<ReturnType<typeof breakoutRaster>>> {
  let raster: Awaited<ReturnType<typeof breakoutRaster>> | undefined;
  await expect.poll(async () => {
    try { raster = await breakoutRaster(page); return true; }
    catch (e) { if (!(e instanceof Error) || !e.message.startsWith('Original cyan paddle is not yet')) throw e; return false; }
  }, { timeout: 10_000 }).toBe(true);
  return raster!;
}
export async function breakoutBall(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.getByTestId('game-canvas').evaluate((element) => {
    const c = element as HTMLCanvasElement, pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Uint8Array(c.width * c.height), objects: { x: number; y: number; width: number; height: number }[] = [];
    // Source pilot: grey/white moving ball below brick rows, excluding fixed
    // wall columns and the separate cyan paddle. Decode actual raster pixels.
    const white = (i: number) => pixels[i * 4] === 204 && pixels[i * 4 + 1] === 204 && pixels[i * 4 + 2] === 204;
    for (let y = 174; y <= 407; y++) for (let x = 6; x <= 289; x++) {
      const first = y * c.width + x; if (seen[first] || !white(first)) continue;
      const queue = [first]; seen[first] = 1; let xmin = x, xmax = x, ymin = y, ymax = y, count = 0;
      while (queue.length) {
        const i = queue.pop()!, px = i % c.width, py = Math.floor(i / c.width); count++;
        xmin = Math.min(xmin, px); xmax = Math.max(xmax, px); ymin = Math.min(ymin, py); ymax = Math.max(ymax, py);
        for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
          const nx = px + dx, ny = py + dy, n = ny * c.width + nx;
          if ((dx || dy) && nx >= 6 && nx <= 289 && ny >= 174 && ny <= 407 && !seen[n] && white(n)) { seen[n] = 1; queue.push(n); }
        }
      }
      const width = xmax - xmin + 1, height = ymax - ymin + 1;
      if (width >= 3 && width <= 6 && height >= 3 && height <= 5 && count >= 6) objects.push({ x: (xmin + xmax) / 2, y: (ymin + ymax) / 2, width, height });
    }
    if (objects.length !== 1) throw new Error('A single original-shaped ball is not currently visible below the bricks.');
    return objects[0];
  });
}
export async function expectBreakoutGeometry(page: Page, insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): Promise<unknown> {
  const viewport = page.viewportSize()!, canvas = (await page.getByTestId('game-canvas').boundingBox())!;
  expect(canvas.width / canvas.height).toBeCloseTo(324 / 432, 3);
  const bounds: { id: string; target: Bounds }[] = [];
  for (const id of ['paddle-p1', 'serve-game', 'insert-coin', 'start-game', 'start-game-2', 'pause']) {
    const control = page.getByTestId(id); await expect(control).toBeVisible(); const target = (await control.boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
    for (const box of [canvas, target]) {
      expect(box.x).toBeGreaterThanOrEqual(insets.left - .001); expect(box.y).toBeGreaterThanOrEqual(insets.top - .001);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - insets.right + .001);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - insets.bottom + .001);
    }
    const separation = Math.max(target.x - canvas.x - canvas.width, canvas.x - target.x - target.width,
      target.y - canvas.y - canvas.height, canvas.y - target.y - target.height);
    expect(separation, `${id} is outside the native raster`).toBeGreaterThanOrEqual(8 - .001);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
      { x: target.x + target.width / 2, y: target.y + target.height / 2 })).toBe(id);
    bounds.push({ id, target });
  }
  const track = (await page.getByTestId('paddle-p1').locator('.control-track').boundingBox())!;
  expect(track.width).toBeGreaterThanOrEqual(120); expect(track.height).toBe(4);
  await expect(page.getByTestId('paddle-p1')).toHaveAttribute('aria-orientation', 'horizontal');
  for (const id of ['paddle-p2', 'paddle-p3', 'paddle-p4', 'direction-p1-up', 'direction-p2-up']) await expect(page.getByTestId(id)).toBeHidden();
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const a = bounds[i].target, b = bounds[j].target;
    expect(Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x) || Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y)).toBe(true);
  }
  return { viewport, insets, canvas, track, controls: bounds };
}
