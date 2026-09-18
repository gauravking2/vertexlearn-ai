import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // NOTE: cdn.playwright.dev is unreachable from some environments. When
      // the bundled Chromium cannot be downloaded, run with
      // PLAYWRIGHT_CHANNEL=msedge (or chrome) to reuse an installed browser
      // instead — no config edit needed:
      //   $env:PLAYWRIGHT_CHANNEL='msedge'; npx playwright test
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL as 'chrome' | 'msedge' } : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 3000 --strictPort',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
