// SPDX-License-Identifier: GPL-3.0-or-later
// Shared black-box helpers for the specs of games ported from 0.2.0 on
// (tests/browser/game-<id>.spec.ts, docs/PORT_GAME.md). They read the ?debug
// observation and the canvas; they never inject circuit state. Waits are
// bounded in simulated time (docs/TESTING.md, "Simulated time, not host speed").
import { expect, type Page } from '@playwright/test';

/** The full ?debug snapshot (web/src/main.ts). */
export async function state(page: Page): Promise<any> {
  return page.evaluate(async () => (window as any).__nocpuDebug.snapshot());
}
export const simulatedPs = async (page: Page): Promise<bigint> => BigInt((await state(page)).timePs);

/** Poll until the predicate holds or the circuit has run `simulatedSeconds`
 * more; the wall-clock timeout only ends a stalled simulation. Returns the
 * last snapshot, so the caller asserts on circuit state, not on host speed. */
export async function untilCircuit(page: Page, predicate: (snapshot: any) => boolean, simulatedSeconds: number, timeout = 120_000): Promise<any> {
  const limit = (await simulatedPs(page)) + BigInt(Math.round(simulatedSeconds * 1000)) * 1_000_000_000n;
  let snapshot: any;
  await expect.poll(async () => {
    snapshot = await state(page);
    return predicate(snapshot) || BigInt(snapshot.timePs) >= limit;
  }, { timeout }).toBe(true);
  return snapshot;
}

/** Hold the worker's clock (no wall-clock pacing) and advance it explicitly. */
export async function holdClock(page: Page, held: boolean): Promise<void> {
  await page.evaluate((value) => (window as any).__nocpuDebug.holdClock(value), held);
}
export async function stepClock(page: Page, microseconds: number): Promise<void> {
  for (let remaining = microseconds; remaining > 0; remaining -= 1_000_000) {
    await page.evaluate((step) => (window as any).__nocpuDebug.stepClock(step), Math.min(1_000_000, remaining));
  }
}
/** Step the held clock in `stepUs` slices until the predicate holds or `limitUs` passes. */
export async function stepUntil(page: Page, predicate: (snapshot: any) => boolean, limitUs: number, stepUs = 10_000): Promise<any> {
  let snapshot = await state(page);
  for (let elapsed = 0; elapsed < limitUs && !predicate(snapshot); elapsed += stepUs) {
    await stepClock(page, stepUs); snapshot = await state(page);
  }
  return snapshot;
}

/** Open Play from Home and start a game as a player would, on a ?debug page. */
export async function launch(page: Page, gameId: string): Promise<any> {
  await page.goto('./?debug');
  await page.getByTestId('open-library').click();
  await page.getByTestId(`game-${gameId}`).click();
  await page.getByTestId('play-selected').click();
  await expect(page.getByTestId('insert-coin')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.game-shell')).toHaveAttribute('data-screen', 'playing');
  return untilCircuit(page, (snapshot) => snapshot.gameId === gameId && BigInt(snapshot.timePs) >= 800_000_000_000n, 2);
}

/** Lit horizontal runs [first, last] of one row of the presented circuit raster. */
export async function rasterRuns(page: Page, row: number, threshold = 150): Promise<[number, number][]> {
  return page.getByTestId('game-canvas').evaluate((element, { row, threshold }) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, row, canvas.width, 1).data;
    const runs: [number, number][] = [];
    let start = -1;
    for (let x = 0; x <= canvas.width; x += 1) {
      const lit = x < canvas.width && data[x * 4] >= threshold;
      if (lit && start < 0) start = x;
      else if (!lit && start >= 0) { runs.push([start, x - 1]); start = -1; }
    }
    return runs;
  }, { row, threshold });
}

/** Wait until the canvas presents a frame produced at or after this snapshot. */
export async function presented(page: Page, snapshot: any): Promise<void> {
  await expect.poll(async () => (await state(page)).presentedFrame, { timeout: 30_000 }).toBeGreaterThanOrEqual(snapshot.frame);
}
