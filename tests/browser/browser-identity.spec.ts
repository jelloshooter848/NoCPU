// SPDX-License-Identifier: GPL-3.0-or-later
// Records which browser engine build this project's tests ran in, for the
// desktop acceptance record (tools/desktop-acceptance.py). Every test in a
// project shares this worker's browser (workers: 1), so its version is the
// version the gameplay tests ran in. Playwright's engines are real Chromium,
// Firefox and WebKit, but Playwright's own test builds, not Chrome or a
// release Firefox; the record names them that way.
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function osName(): string {
  try {
    const pretty = readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]*)"?$/m);
    if (pretty) return `${pretty[1]} (${os.type()} ${os.release()})`;
  } catch { /* not Linux */ }
  return `${os.type()} ${os.release()}`;
}

test('browser identity for the desktop acceptance record', async ({ browser, browserName, page }, testInfo) => {
  const version = browser.version();
  expect(version).toMatch(/^\d+(\.\d+)+/);
  await page.goto('about:blank');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const playwright = JSON.parse(readFileSync(new URL('../../node_modules/@playwright/test/package.json', import.meta.url), 'utf8')).version;
  const identity = {
    schema_version: 1,
    project: testInfo.project.name,
    engine: browserName,
    version,
    // Headless Chromium runs use Playwright's chromium-headless-shell build of the same version.
    headless: testInfo.project.use.headless !== false,
    playwright_version: playwright,
    // The desktop device profile sets this string; it is not the engine's own identity.
    emulated_user_agent: userAgent,
    os: osName(),
  };
  const directory = `${root}build/browser-identity`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/${testInfo.project.name}.json`, JSON.stringify(identity, null, 2) + '\n');
});
