import { defineConfig, devices } from '@playwright/test';

/* Puerto configurable: 4173 suele estar ocupado por otros servidores locales
   (p.ej. el http.server de otro proyecto local) y con reuseExistingServer los
   tests terminaban corriendo contra OTRO sitio. */
const PORT = Number(process.env.CATT_TEST_PORT || 4319);

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
  /* 4 workers: con más, algunos tests viejos basados en timeouts fijos (toasts, carga async de provincias) se vuelven flaky */
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  timeout: 20_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
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
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ..`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
