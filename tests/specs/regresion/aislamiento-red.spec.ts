/**
 * Garantía de la suite: NINGÚN test habla con el Firebase real ni con la
 * API real de GitHub. Recorre todas las páginas y verifica cero intentos a
 * backends de Firebase (*.googleapis.com / *.firebaseapp.com / firebaseio).
 * Debe pasar siempre.
 */
import { test, expect } from '@playwright/test';
import { setupPage, getFirebaseBackendRequests, getExternalRequests } from '../../helpers/setup';
import { entrarAlPortal } from '../../helpers/portal';

const PAGINAS = ['/index.html', '/tienda.html', '/producto.html?id=1', '/seguimiento.html?code=AAAAAAAAAA',
  '/seguimiento-mayorista.html?code=MAY-AAAAAAAAAA', '/pedidos.html', '/qr.html', '/404.html'];

test.describe('Aislamiento de red @regresion @red', () => {
  for (const url of PAGINAS) {
    test(`${url} no intenta contactar Firebase real @regresion`, async ({ page }) => {
      await setupPage(page, { portalSession: true, perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' });
      await page.goto(url);
      await page.waitForTimeout(1200);
      expect(getFirebaseBackendRequests(page)).toEqual([]);
    });
  }

  test('portal (entrar + abrir pestañas) no contacta Firebase real y GitHub queda mockeado @regresion', async ({ page }) => {
    await setupPage(page);
    const portal = await entrarAlPortal(page);
    for (const t of ['catalogo', 'stock', 'mayoristas']) await portal.abrirTab(t);
    await page.waitForTimeout(500);
    expect(getFirebaseBackendRequests(page)).toEqual([]);
    /* los únicos externos son la API de GitHub (interceptada por el mock) y fuentes (abortadas) */
    expect(getExternalRequests(page).every(u => /api\.github\.com|fonts\.googleapis\.com/.test(u))).toBe(true);
  });
});
