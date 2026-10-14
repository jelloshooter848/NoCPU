import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { packagedDirectory, shellArgument } from './tests/package-directory';

const remoteBase = process.env.NOCPU_TEST_BASE_URL;
if (remoteBase) {
  const url = new URL(remoteBase);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) {
    throw new Error('NOCPU_TEST_BASE_URL must be an HTTP(S) URL without credentials ending in /.');
  }
}

// ROM-backed runs (NOCPU_TEST_ROM_SAFE=1) record no traces, videos, failure
// screenshots or HTML report: their frames would be ROM-derived. The JSON report
// is filtered by tools/strip-rom-report.py before anything leaves the runner.
const romSafe = process.env.NOCPU_TEST_ROM_SAFE === '1';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // On CI Playwright copies the commit, PR title and source diff into the report
  // metadata. ROM-backed reports leave the runner only after a strict scan, so
  // they carry no repository text (tools/strip-rom-report.py also drops it).
  ...(romSafe ? { captureGitInfo: { commit: false, diff: false } } : {}),
  retries: 0,
  reporter: romSafe
    ? [['list'], ['json', { outputFile: 'build/rom-browser-matrix.json' }]]
    : [['list'], ['html', { outputFolder: 'build/playwright-report', open: 'never' }], ['json', { outputFile: 'build/browser-matrix.json' }]],
  outputDir: 'build/browser-results',
  use: {
    baseURL: remoteBase ?? 'http://127.0.0.1:4173/NoCPU/',
    trace: romSafe ? 'off' : 'retain-on-failure',
    screenshot: romSafe ? 'off' : 'only-on-failure',
    video: 'off',
  },
  webServer: remoteBase ? undefined : {
    command: process.env.NOCPU_TEST_PACKAGED === '1'
      ? `python3 tools/serve-pages.py --directory ${shellArgument(packagedDirectory(fileURLToPath(new URL('./', import.meta.url))))} --base /NoCPU/ --host 127.0.0.1 --port 4173`
      : 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/NoCPU/',
    timeout: 30_000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], launchOptions: { executablePath: process.env.NOCPU_WEBKIT_EXECUTABLE || undefined } } },
  ],
});
