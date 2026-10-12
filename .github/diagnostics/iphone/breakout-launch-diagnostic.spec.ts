// Ignored proposed one-case reproduction; same original assertions/timeouts.
import { test, expect } from '@playwright/test';
import { installAudioProbe, expectViewportShell } from '../../../../tests/browser/helpers';
import { launchBreakout, startBreakout, expectBreakoutGeometry } from '../../../../tests/browser/v050-breakout-helpers';
import { installLaunchDiagnostic } from './breakout-launch-diagnostic';
test.beforeEach(async ({ page }) => {
  await installAudioProbe(page);
  // Preserve the original failed suite's request-observation adapter exactly.
  await page.addInitScript(() => {
    const target = window as any, original = Worker.prototype.postMessage;
    target.__breakoutCommands = [];
    Worker.prototype.postMessage = function (message: any, ...args: any[]) {
      target.__breakoutCommands.push(structuredClone(message));
      return Reflect.apply(original, this, [message, ...args]);
    };
  });
});
test('Breakout stays game-first with unobscured horizontal touch and Serve controls in compact portrait/landscape software Home mode',
  async ({ page }, testInfo) => {
    const finish = await installLaunchDiagnostic(page,testInfo);
    try {
      await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
      await launchBreakout(page); await startBreakout(page); const geometry: unknown[] = [];
      for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
        await page.setViewportSize(size); const safe = size.width < size.height ? { top: 47, right: 0, bottom: 34, left: 0 } : { top: 0, right: 47, bottom: 21, left: 47 };
        await page.evaluate((safe) => { for (const [k, v] of Object.entries(safe)) document.documentElement.style.setProperty(`--safe-${k}`, `${v}px`); }, safe);
        await expectViewportShell(page); geometry.push(await expectBreakoutGeometry(page, safe));
        await expect(page.locator('.game-shell')).toHaveAttribute('data-display-mode', 'standalone');
        await page.screenshot({ path: testInfo.outputPath(`breakout-software-home-${size.width}x${size.height}.png`) });
      }
      await testInfo.attach('breakout-game-first-software-geometry.json', { body:JSON.stringify({ geometry, syntheticSafeAreas:true, physicalInstallation:false },null,2), contentType:'application/json' });
    } finally { await finish(); }
  });
