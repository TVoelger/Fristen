import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure',
    launchOptions: process.env.FRISTEN_CHROMIUM_PATH ? {
      executablePath: process.env.FRISTEN_CHROMIUM_PATH,
      args: JSON.parse(process.env.FRISTEN_CHROMIUM_ARGS || '[]'),
    } : {},
  },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
