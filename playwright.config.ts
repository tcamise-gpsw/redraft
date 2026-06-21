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
        `mkdir -p ${LOCAL_WORKSPACE_ROOT}/docs ${LOCAL_WORKSPACE_ROOT}/.redraft/comments && ` +
        `cp proposals/api-design-v2.md ${LOCAL_WORKSPACE_ROOT}/api-design-v2.md && ` +
        `cp proposals/auth-overhaul.md ${LOCAL_WORKSPACE_ROOT}/docs/auth-overhaul.md && ` +
        `cp proposals/api-design-v2.comments.json ${LOCAL_WORKSPACE_ROOT}/.redraft/comments/api-design-v2.comments.json && ` +
        `npm run build && ` +
        `node --import tsx server/cli.ts serve ${LOCAL_WORKSPACE_ROOT} --port 4201`,
      url: 'http://127.0.0.1:4201',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
