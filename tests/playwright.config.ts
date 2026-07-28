import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para Cattorini.
 * El baseURL apunta a un servidor local que servimos desde pages/cattorini/.
 * Firebase se mockea en cada test via addInitScript.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  timeout: 20_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    /* Nota: viewport default 1280x720. Para responsive tests se puede overridear. */
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Levanta http.server de Python sirviendo pages/cattorini como raíz.
     `python3 -m http.server` sirve el cwd. Corremos desde el padre. */
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ..',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
