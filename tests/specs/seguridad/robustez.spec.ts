/**
 * ROBUSTEZ (FALLA HOY) — carrera en el gate de identificación de la tienda.
 *
 * tienda.html: init() (script inline) → await productos.json → showModal()
 * → initModalUbicaciones() hace `if (ubicacionGate || !window.Ubicaciones) return;`
 * pero ubicaciones.js se carga con `defer`. Si productos.json llega antes de
 * que corra ubicaciones.js (red lenta para ese script, caché, etc.) el select
 * de provincias queda VACÍO para siempre: el visitante nuevo no puede
 * identificarse como minorista y no puede comprar. (Es la causa del test
 * "minorista de zona libre entra al catálogo" que falla de forma intermitente.)
 */
import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';

test('gate de la tienda: las provincias cargan aunque ubicaciones.js llegue tarde @seguridad @calidad', async ({ page }) => {
  await setupPage(page);
  await page.route('**/ubicaciones.js', async route => {
    await new Promise(r => setTimeout(r, 1500));
    await route.continue();
  });
  const tienda = new TiendaPage(page);
  await tienda.goto();
  await tienda.elegirMinorista();
  await expect.poll(() => page.locator('#input-provincia option').count(), { timeout: 8000 }).toBeGreaterThan(1);
});
