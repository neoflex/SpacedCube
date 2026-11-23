// Browser tests (tests/e2e): every screen with axe, keyboard and focus, offline and sync.
// The app is built into dist/ first. CHROME=/path/to/chrome makes Chromium use another binary.
import { defineConfig, devices } from '@playwright/test';

const chromium = { ...devices['Desktop Chrome'] };
if (process.env.CHROME) chromium.launchOptions = { executablePath: process.env.CHROME, args: ['--no-sandbox'] };

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.mjs',
  timeout: 120000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { trace: 'off', reducedMotion: 'reduce' },
  projects: [
    { name: 'chromium', use: chromium },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
