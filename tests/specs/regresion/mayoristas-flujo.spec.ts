/**
 * REGRESIÓN: alta / aprobación / rechazo de mayoristas en el portal y
 * validación del código en la tienda. Deben pasar hoy y después del arreglo.
 *
 * No se asume DÓNDE queda el código en la solicitud (hoy en
 * respuesta.codigoMayorista en texto plano; el arreglo puede sacarlo): el
 * código se lee del modal que ve el admin, que es lo que se le manda al
 * mayorista por WhatsApp.
 */
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { setupPage, getCollection } from '../../helpers/setup';
import { entrarAlPortal } from '../../helpers/portal';
import { TiendaPage } from '../../pages/tienda.page';
import { solicitudPendienteSample } from '../../fixtures/test-data';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

test.describe('Mayoristas — alta, aprobación y validación @regresion @mayorista', () => {

  test('aprobar solicitud → crea mayorista activo por hash → el código entra a la tienda @regresion @critical', async ({ page, browser }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: { 'SOLDOC1': solicitudPendienteSample } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('solicitudes');
    const card = page.locator('#solicitudes-list .item-row', { hasText: solicitudPendienteSample.solicitante.negocio });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /Aceptar/ }).click();

    await expect(page.locator('#modal-codigo')).toBeVisible();
    const codigo = ((await page.locator('#mc-codigo').textContent()) || '').trim();
    expect(codigo).toMatch(/^CATT-[A-Z0-9]{6,}$/);

    const activos = await getCollection(page, 'mayoristas_activos');
    expect(Object.keys(activos)).toEqual([sha256(codigo)]);
    expect(activos[sha256(codigo)]).toMatchObject({
      nombre: solicitudPendienteSample.solicitante.nombre,
      negocio: solicitudPendienteSample.solicitante.negocio,
      localidad: solicitudPendienteSample.solicitante.localidad
    });
    const sols = Object.values(await getCollection(page, 'solicitudes_mayoristas')) as any[];
    expect(sols.find(s => s.codigo === solicitudPendienteSample.codigo).estado).toBe('aceptada');

    /* El mayorista usa el código en la tienda (otra pestaña/otro dispositivo) */
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await setupPage(p2, { firebase: { collections: { mayoristas_activos: activos } } });
    const tienda = new TiendaPage(p2);
    await tienda.goto();
    await tienda.elegirMayorista();
    await tienda.ingresarCodigoMayorista(codigo);
    await expect(tienda.catalog).toBeVisible();
    await expect(tienda.productCard('Camisa Oxford Blanca')).toContainText('14.500');
    const guardado = await p2.evaluate(() => JSON.parse(localStorage.getItem('catt_mayorista_data') || 'null'));
    expect(guardado).toMatchObject({ nombre: solicitudPendienteSample.solicitante.nombre });
    await ctx.close();
  });

  test('código incorrecto no da acceso mayorista @regresion', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { mayoristas_activos: { [sha256('CATT-BUENO1')]: { nombre: 'X', negocio: 'Y' } } } } });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.elegirMayorista();
    await tienda.ingresarCodigoMayorista('CATT-MALO99');
    await expect(page.locator('#err-codigo')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('catt_perfil'))).not.toBe('mayorista');
  });

  test('rechazar solicitud la marca como rechazada y no crea mayorista @regresion', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: { 'SOLDOC1': solicitudPendienteSample } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('solicitudes');
    const card = page.locator('#solicitudes-list .item-row', { hasText: solicitudPendienteSample.solicitante.negocio });
    await card.getByRole('button', { name: /Rechazar/ }).click();
    await expect.poll(async () => {
      const sols = Object.values(await getCollection(page, 'solicitudes_mayoristas')) as any[];
      return sols[0].estado;
    }).toBe('rechazada');
    expect(Object.keys(await getCollection(page, 'mayoristas_activos'))).toHaveLength(0);
  });

  test('alta manual de mayorista desde el portal @regresion', async ({ page }) => {
    await setupPage(page);
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('alta');
    await page.locator('#am-nombre').fill('Mayorista Manual');
    await page.locator('#am-negocio').fill('Comercio Manual');
    await page.locator('#am-wa').fill('5492244000000');
    await page.locator('#am-btn').click();
    await expect(page.locator('#modal-codigo')).toBeVisible();
    const codigo = ((await page.locator('#mc-codigo').textContent()) || '').trim();
    const activos = await getCollection(page, 'mayoristas_activos');
    expect(activos[sha256(codigo)]).toMatchObject({ nombre: 'Mayorista Manual', negocio: 'Comercio Manual' });
    const sols = Object.values(await getCollection(page, 'solicitudes_mayoristas')) as any[];
    expect(sols).toHaveLength(1);
    expect(sols[0].estado).toBe('aceptada');
  });
});
