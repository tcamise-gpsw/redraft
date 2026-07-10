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
      testIgnore: ['e2e/local-mode.spec.ts', 'e2e/comment-perf.spec.ts'],
      use: {
        baseURL: 'http://127.0.0.1:4173',
      },
    },
    {
      name: 'local',
      testMatch: ['e2e/local-mode.spec.ts', 'e2e/comment-perf.spec.ts'],
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
        `rm -rf ${LOCAL_WORKSPACE_ROOT} && mkdir -p ${LOCAL_WORKSPACE_ROOT} && ` +
        `rsync -a --exclude='.git' --exclude='.redraft' test-fixtures/ ${LOCAL_WORKSPACE_ROOT}/ && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} init && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} config user.name 'ReDraft Test' && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} config user.email redraft@example.com && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} add . && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} commit -m 'Initial documents' && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} branch -M main && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} checkout --orphan redraft && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} rm -rf --ignore-unmatch . && ` +
        `rsync -a test-fixtures/.redraft/ ${LOCAL_WORKSPACE_ROOT}/.redraft/ && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} add .redraft && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} commit -m 'Seed ReDraft sidecars' && ` +
        `git -C ${LOCAL_WORKSPACE_ROOT} checkout main && ` +
        `npm run build && ` +
        `node --import tsx server/cli.ts serve ${LOCAL_WORKSPACE_ROOT} --port 4201`,
      url: 'http://127.0.0.1:4201',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
