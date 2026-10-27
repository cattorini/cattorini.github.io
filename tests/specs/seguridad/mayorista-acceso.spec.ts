/**
 * SEGURIDAD — acceso mayorista y gestión de códigos (FALLAN HOY).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setupPage, getCollection } from '../../helpers/setup';
import { entrarAlPortal } from '../../helpers/portal';
import { TiendaPage } from '../../pages/tienda.page';
import { mayoristaSample, solicitudPendienteSample } from '../../fixtures/test-data';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

test.describe('Acceso mayorista @seguridad @mayorista', () => {

  test('el hash publicado en el productos.json REAL no alcanza para entrar como mayorista @seguridad @critical', async ({ page }) => {
    /* productos.json es público: cualquiera lee config.mayoristas.codigo_hash
       y lo pega en localStorage. Hoy validarPerfilPersistido() compara
       localStorage contra ese mismo hash → acceso mayorista sin código. */
    const real = JSON.parse(readFileSync(resolve(__dirname, '../../../productos.json'), 'utf8'));
    const hashPublico = real?.config?.mayoristas?.codigo_hash;
    test.skip(!hashPublico, 'productos.json ya no publica un hash de código master');
    await setupPage(page, { catalogo: 'real', perfil: 'mayorista', codigoHashValido: hashPublico });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => localStorage.getItem('catt_perfil')),
      'quedó con perfil mayorista usando solo el hash público').not.toBe('mayorista');
  });

  test('si Firestore falla al revalidar el código, NO se mantiene el perfil mayorista (fail-closed) @seguridad', async ({ page }) => {
    await setupPage(page, {
      perfil: 'mayorista', codigoHashValido: sha256('CATT-REVOCA'), mayoristaData: mayoristaSample,
      firebase: { failReadsFrom: ['mayoristas_activos'] }
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => localStorage.getItem('catt_perfil'))).not.toBe('mayorista');
  });

  test('doble click en "Aceptar" una solicitud crea UN solo mayorista activo @seguridad @portal', async ({ page }) => {
    await setupPage(page, {
      firebase: { latency: 300, collections: { solicitudes_mayoristas: { SOLDOC1: solicitudPendienteSample } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('solicitudes');
    const btn = page.locator('#solicitudes-list .item-row').getByRole('button', { name: /Aceptar/ });
    await expect(btn).toBeVisible();
    await btn.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await page.waitForTimeout(2500);
    expect(Object.keys(await getCollection(page, 'mayoristas_activos'))).toHaveLength(1);
  });

  test('regenerar código: el código viejo deja de figurar en la solicitud y el nuevo es el único activo @seguridad @portal', async ({ page }) => {
    const VIEJO = 'CATT-VIEJO1';
    await setupPage(page, {
      firebase: { collections: {
        mayoristas_activos: { [sha256(VIEJO)]: { ...mayoristaSample, solicitudId: 'SOLDOC1', solicitudCodigo: 'MAY-WXYZ' } },
        solicitudes_mayoristas: { SOLDOC1: { ...solicitudPendienteSample, codigo: 'MAY-WXYZ', estado: 'aceptada',
          respuesta: { codigoMayorista: VIEJO } } }
      } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('activos');
    await page.locator('#activos-list').getByRole('button', { name: 'Regenerar código' }).click();
    await expect(page.locator('#modal-codigo')).toBeVisible();
    const nuevo = ((await page.locator('#mc-codigo').textContent()) || '').trim();
    expect(Object.keys(await getCollection(page, 'mayoristas_activos'))).toEqual([sha256(nuevo)]);
    const sol = (await getCollection(page, 'solicitudes_mayoristas')).SOLDOC1;
    expect(JSON.stringify(sol), 'la solicitud sigue mostrando el código revocado').not.toContain(VIEJO);
  });

  test('códigos mayoristas y de solicitud se generan con crypto.getRandomValues, no Math.random @seguridad', async ({ page }) => {
    /* Se fuerza Math.random a 0: si los códigos salen todos iguales
       ("CATT-AAAAAA"), se están generando con Math.random. */
    await page.addInitScript(() => { Math.random = () => 0; });
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: { SOLDOC1: solicitudPendienteSample } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('solicitudes');
    await page.locator('#solicitudes-list .item-row').getByRole('button', { name: /Aceptar/ }).click();
    await expect(page.locator('#modal-codigo')).toBeVisible();
    const codigo = ((await page.locator('#mc-codigo').textContent()) || '').trim();
    expect(codigo).not.toMatch(/^CATT-A+$/);
  });
});
