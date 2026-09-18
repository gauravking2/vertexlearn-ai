import { defineConfig, devices } from '@playwright/test';

// Temporary Phase 7 config: serves the CURRENT source on :3100 (the :3000
// port is occupied by the Phase 6 live container, left untouched).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'off',
  },
  projects: [
    {
      name: 'edge',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 3100 --strictPort',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
