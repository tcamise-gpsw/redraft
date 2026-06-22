import { defineConfig } from '@playwright/test';

const LOCAL_WORKSPACE_ROOT = '/tmp/redraft-local-playwright';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'remote',
      testIgnore: ['e2e/local-mode.spec.ts'],
      use: {
        baseURL: 'http://127.0.0.1:4173',
      },
    },
    {
      name: 'local',
      testMatch: ['e2e/local-mode.spec.ts'],
      use: {
        baseURL: 'http://127.0.0.1:4201',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command:
        `rm -rf ${LOCAL_WORKSPACE_ROOT} && ` +
        `rsync -a --exclude='.git' test-fixtures/ ${LOCAL_WORKSPACE_ROOT}/ && ` +
        `npm run build && ` +
        `node --import tsx server/cli.ts serve ${LOCAL_WORKSPACE_ROOT} --port 4201`,
      url: 'http://127.0.0.1:4201',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
