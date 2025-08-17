// Playwright configuration for SOLID compliance testing
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: '../test-results' }],
    ['json', { outputFile: '../test-results/results.json' }],
    ['junit', { outputFile: '../test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { 
        headless: true
      },
    },
  ],
  webServer: {
    command: 'cd ../.. && python -m http.server 8080',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
});
