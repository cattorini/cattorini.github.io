/**
 * SEGURIDAD — acceso del staff (FALLAN HOY).
 *
 * Hoy:
 *  - pedidos.html confía en sessionStorage 'catt_pedidos_session' = 'ok'
 *    (cualquiera lo setea desde la consola) y además las reglas dejan leer
 *    todos los pedidos sin login.
 *  - portal.html y pedidos.html hacen signInAnonymously(), y las reglas
 *    tratan a CUALQUIER usuario autenticado como admin.
 *
 * Objetivo: el staff entra con Firebase Auth email/contraseña (allowlist en
 * reglas). Sin ese login, ninguna pantalla de staff lee datos privados y
 * nunca se usa login anónimo.
 */
import { test, expect } from '@playwright/test';
import { setupPage, getFirebaseLog, getFirebaseBackendRequests } from '../../helpers/setup';
import { pedidoPendienteSample, solicitudPendienteSample } from '../../fixtures/test-data';

const listasPrivadas = (log: any[], col: string) =>
  log.filter(e => (e.op === 'list' || e.op === 'listen-list') && e.path === col);

test.describe('Acceso de staff @seguridad', () => {

  test('pedidos.html con catt_pedidos_session=ok pero SIN login real no muestra ni lee pedidos @seguridad @pedidos', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: { collections: { pedidos: { [pedidoPendienteSample.codigo]: pedidoPendienteSample } } }
    });
    await page.goto('/pedidos.html');
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText(pedidoPendienteSample.cliente.nombre);
    const log = await getFirebaseLog(page);
    expect(listasPrivadas(log, 'pedidos'), 'leyó la colección pedidos sin login de staff').toEqual([]);
    expect(getFirebaseBackendRequests(page)).toEqual([]);
  });

  test('pedidos.html sin ninguna sesión tampoco lee pedidos @seguridad @pedidos', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { pedidos: { [pedidoPendienteSample.codigo]: pedidoPendienteSample } } }
    });
    await page.goto('/pedidos.html');
    await page.waitForTimeout(1000);
    const log = await getFirebaseLog(page);
    expect(listasPrivadas(log, 'pedidos')).toEqual([]);
    await expect(page.locator('body')).not.toContainText(pedidoPendienteSample.cliente.nombre);
  });

  test('pedidos.html nunca usa login anónimo @seguridad @pedidos', async ({ page }) => {
    await setupPage(page, { portalSession: true });
    await page.goto('/pedidos.html');
    await page.waitForTimeout(1000);
    const log = await getFirebaseLog(page);
    expect(log.filter(e => e.op === 'auth-anonymous')).toEqual([]);
  });

  test('portal.html nunca usa login anónimo @seguridad @portal', async ({ page }) => {
    await setupPage(page);
    await page.goto('/portal.html');
    await page.waitForTimeout(800);
    const log = await getFirebaseLog(page);
    expect(log.filter(e => e.op === 'auth-anonymous')).toEqual([]);
  });

  test('portal: con solo PAT + contraseña local (sin login de staff en Firebase) no lista solicitudes ni mayoristas @seguridad @portal', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: {
        solicitudes_mayoristas: { s1: solicitudPendienteSample },
        mayoristas_activos: { ['a'.repeat(64)]: { nombre: 'Secreto', negocio: 'Secreto SA' } }
      } }
    });
    /* Flujo de hoy: PAT + contraseña local. No esperamos "Sincronizado":
       con el arreglo el portal puede pedir además el login de staff. */
    const { PortalPage } = await import('../../pages/portal.page');
    const { PAT_FAKE, PASS_PORTAL } = await import('../../helpers/portal');
    page.on('dialog', d => d.accept().catch(() => {}));
    const portal = new PortalPage(page);
    await portal.goto();
    await portal.setupInicial(PAT_FAKE, PASS_PORTAL);
    await page.waitForTimeout(1500);
    const log = await getFirebaseLog(page);
    expect(listasPrivadas(log, 'solicitudes_mayoristas')).toEqual([]);
    expect(listasPrivadas(log, 'mayoristas_activos')).toEqual([]);
  });
});
