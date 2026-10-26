/**
 * SEGURIDAD — seguimiento por código SIN listar la colección (FALLAN HOY).
 *
 * Hoy seguimiento.html / seguimiento-mayorista.html buscan con
 * where('codigo','==',X), que es una operación LIST: obliga a que las reglas
 * permitan listar pedidos/solicitudes a cualquiera (y por eso se descargaron
 * todos sin login). Objetivo: el doc ID ES el código y se hace
 * doc(codigo).get() — las reglas pueden permitir `get` y negar `list`.
 *
 * Estos tests además verifican que el seguimiento SIGUE FUNCIONANDO.
 */
import { test, expect } from '@playwright/test';
import { setupPage, getFirebaseLog, getFirebaseBackendRequests } from '../../helpers/setup';
import { SeguimientoPage } from '../../pages/seguimiento.page';
import { pedidoPendienteSample, solicitudAceptadaSample } from '../../fixtures/test-data';

const COD_PEDIDO = 'K7M2Q9X4PZ';      // formato objetivo: >= 10 caracteres
const COD_SOL = 'MAY-K7M2Q9X4PZ';

const listas = (log: any[], col: string) =>
  log.filter(e => (e.op === 'list' || e.op === 'listen-list') && e.path === col);

test.describe('Seguimiento por código (get por ID, sin list) @seguridad @seguimiento', () => {

  test('seguimiento.html encuentra el pedido por ID = código y no lista la colección @seguridad', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { pedidos: { [COD_PEDIDO]: { ...pedidoPendienteSample, codigo: COD_PEDIDO } } } }
    });
    const seg = new SeguimientoPage(page);
    await page.goto(`/seguimiento.html?code=${COD_PEDIDO}`);
    await expect(page.locator('#pedido-card')).toBeVisible();
    await expect(page.locator('#code-display')).toContainText(COD_PEDIDO);
    await expect(page.locator('#detalle-cliente')).toContainText(pedidoPendienteSample.cliente.nombre);
    const log = await getFirebaseLog(page);
    expect(listas(log, 'pedidos'), 'seguimiento hizo un LIST/where sobre pedidos').toEqual([]);
    expect(log.some(e => (e.op === 'get' || e.op === 'listen-doc') && e.path === 'pedidos/' + COD_PEDIDO)).toBe(true);
    expect(getFirebaseBackendRequests(page)).toEqual([]);
    void seg;
  });

  test('seguimiento.html acepta el código en minúsculas @seguridad', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { pedidos: { [COD_PEDIDO]: { ...pedidoPendienteSample, codigo: COD_PEDIDO } } } }
    });
    await page.goto(`/seguimiento.html?code=${COD_PEDIDO.toLowerCase()}`);
    await expect(page.locator('#pedido-card')).toBeVisible();
  });

  test('seguimiento.html con código inexistente muestra "no encontrado" sin listar @seguridad', async ({ page }) => {
    await setupPage(page);
    await page.goto('/seguimiento.html?code=ZZZZZZZZZZ');
    await expect(page.locator('#not-found-card')).toBeVisible();
    expect(listas(await getFirebaseLog(page), 'pedidos')).toEqual([]);
  });

  test('seguimiento-mayorista.html encuentra la solicitud por ID = código y no lista @seguridad', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: { [COD_SOL]: { ...solicitudAceptadaSample, codigo: COD_SOL } } } }
    });
    await page.goto(`/seguimiento-mayorista.html?code=${COD_SOL}`);
    await expect(page.locator('#solicitud-datos')).toContainText(solicitudAceptadaSample.solicitante.nombre);
    const log = await getFirebaseLog(page);
    expect(listas(log, 'solicitudes_mayoristas'), 'seguimiento-mayorista hizo un LIST/where').toEqual([]);
  });
});
