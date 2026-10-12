// Ignored proposed config; execute only on ordinary supported remote runner.
import base from '../../../../playwright.config';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../../..');
if (!base.webServer || Array.isArray(base.webServer)) throw new Error('Reviewed one-case diagnostic needs one packaged server');
export default defineConfig({ ...base, testDir:here,testMatch:'breakout-launch-diagnostic.spec.ts', retries:0,workers:1,
  projects:base.projects?.filter(project=>project.name==='iphone-emulated'),
  outputDir:resolve(root,'build/iphone-launch-diagnostic-v1/results'),
  reporter:[['json',{outputFile:resolve(root,'build/iphone-launch-diagnostic-v1/matrix.json')}]],
  use:{...base.use,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{...base.webServer,cwd:root},
});
