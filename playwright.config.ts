import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 20_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
  },
  webServer: {
    command: 'npm run build && npm run serve',
    // The OneDrive card only shows when the build has an app ID; the browser tests use a made-up one against a fake Microsoft.
    env: { ONEDRIVE_CLIENT_ID: 'ci-test-client' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
