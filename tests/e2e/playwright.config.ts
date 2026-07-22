import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CONSOLE_URL;

if (!baseURL) {
  throw new Error('CONSOLE_URL is required');
}

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    ...devices['Desktop Firefox'],
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  projects: [{ name: 'firefox', use: { browserName: 'firefox' } }]
});
