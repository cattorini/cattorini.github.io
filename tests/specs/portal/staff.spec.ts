/**
 * Portal — sesión de staff, mayoristas sin código en claro, ajuste de stock
 * contra el valor actual (M7) y publicación sin pisar cambios remotos.
 * Todo contra el mock de Firebase y el mock de la API de GitHub.
 */
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { setupPage, getCollection, getFirebaseLog, getGithubPuts, catalogoFixture } from '../../helpers/setup';
import { entrarAlPortal, loginStaff, PAT_FAKE, PASS_PORTAL } from '../../helpers/portal';
import { PortalPage } from '../../pages/portal.page';
import { STAFF_EMAIL, solicitudPendienteSample } from '../../fixtures/test-data';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function hastaLoginStaff(page) {
  page.on('dialog', d => { d.accept().catch(() => {}); });
  const portal = new PortalPage(page);
  await portal.goto();
  await portal.setupInicial(PAT_FAKE, PASS_PORTAL);
  await expect(page.locator('#login-staff')).toBeVisible();
  return portal;
}

test.describe('Portal — sesión de staff @portal @seguridad', () => {

  test('contraseña de staff incorrecta: mensaje en español y no entra @portal @seguridad', async ({ page }) => {
    await setupPage(page);
    const portal = await hastaLoginStaff(page);
    await loginStaff(page, STAFF_EMAIL, 'otra-clave');
    await expect(page.locator('#err-staff')).toHaveText('Email o contraseña incorrectos.');
    await expect(portal.appScreen).toBeHidden();
    const log = await getFirebaseLog(page);
    expect(log.filter(e => e.op === 'list' || e.op === 'listen-list')).toEqual([]);
  });

  test('cuenta autenticada pero sin permiso (permission-denied) → cierra sesión con mensaje claro @portal @seguridad', async ({ page }) => {
    await setupPage(page, { firebase: { failReadsFrom: ['mayoristas_activos'] } });
    const portal = await hastaLoginStaff(page);
    await loginStaff(page);
    await expect(page.locator('#err-staff')).toContainText('no tiene permiso');
    await expect(portal.appScreen).toBeHidden();
    const log = await getFirebaseLog(page);
    expect(log.some(e => e.op === 'auth-signout')).toBe(true);
    expect(log.filter(e => e.op === 'listen-list')).toEqual([]);
  });

  test('"Cerrar sesión de staff" vuelve al login de staff @portal', async ({ page }) => {
    await setupPage(page);
    const portal = await entrarAlPortal(page);
    await page.getByRole('button', { name: 'Cerrar sesión de staff' }).click();
    await expect(page.locator('#login-staff')).toBeVisible();
    await expect(portal.appScreen).toBeHidden();
    /* volver a entrar no recarga el catálogo (no se pierden cambios sin publicar) */
    await loginStaff(page);
    await expect(portal.appScreen).toBeVisible();
  });

  test('ya no existe la UI del código mayorista maestro @portal @seguridad', async ({ page }) => {
    await setupPage(page);
    await entrarAlPortal(page);
    await expect(page.locator('[data-field="config.mayoristas.codigo_hash"]')).toHaveCount(0);
    await expect(page.locator('#new-may-code')).toHaveCount(0);
  });
});

test.describe('Portal — mayoristas sin código en claro @portal @mayorista @seguridad', () => {

  test('aceptar: el código se muestra una vez y NO queda guardado en la solicitud @portal', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { solicitudes_mayoristas: { SOLDOC1: solicitudPendienteSample } } } });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('solicitudes');
    await page.locator('#solicitudes-list .item-row').getByRole('button', { name: /Aceptar/ }).click();
    await expect(page.locator('#modal-codigo')).toBeVisible();
    const codigo = ((await page.locator('#mc-codigo').textContent()) || '').trim();
    expect(codigo).toMatch(/^CATT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    await expect(page.locator('#mc-wa')).toHaveAttribute('href', new RegExp(encodeURIComponent(codigo)));
    const sol = (await getCollection(page, 'solicitudes_mayoristas')).SOLDOC1;
    expect(sol.estado).toBe('aceptada');
    expect(JSON.stringify(sol)).not.toContain(codigo);
    expect(JSON.stringify(sol)).not.toContain(sha256(codigo));
    expect(Object.keys(await getCollection(page, 'mayoristas_activos'))).toEqual([sha256(codigo)]);
    /* se escribió en UNA transacción */
    const log = await getFirebaseLog(page);
    const commit = log.find(e => e.op === 'tx-commit' && e.paths.some((p: string) => p.includes('mayoristas_activos')));
    expect(commit.paths).toEqual(expect.arrayContaining(['set:mayoristas_activos/' + sha256(codigo), 'update:solicitudes_mayoristas/SOLDOC1']));
  });

  test('alta manual: solicitud con ID = código MAY- de 10 caracteres, sin código mayorista, en un batch @portal', async ({ page }) => {
    await setupPage(page);
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('mayoristas');
    await portal.abrirSubtab('alta');
    await page.locator('#am-nombre').fill('Mayorista Manual');
    await page.locator('#am-negocio').fill('Comercio Manual');
    await page.locator('#am-btn').evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await expect(page.locator('#modal-codigo')).toBeVisible();
    const codigo = ((await page.locator('#mc-codigo').textContent()) || '').trim();
    const sols = await getCollection(page, 'solicitudes_mayoristas');
    const ids = Object.keys(sols);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^MAY-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    expect(sols[ids[0]].codigo).toBe(ids[0]);
    expect(JSON.stringify(sols)).not.toContain(codigo);
    expect(Object.keys(await getCollection(page, 'mayoristas_activos'))).toEqual([sha256(codigo)]);
  });
});

test.describe('Portal — stock contra el valor actual (M7) @portal @regresion', () => {

  test('si el stock cambió mientras se editaba, avisa y registra la diferencia REAL @portal', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { stock: { '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' } } } } } } }
    });
    const portal = await entrarAlPortal(page);
    const dialogos: string[] = [];
    page.on('dialog', d => { dialogos.push(d.message()); });
    await portal.abrirTab('stock');
    await portal.abrirSubtab('stock-editar');
    await page.locator('#stock-list .expandable-head-box', { hasText: '#1 · Camisa Oxford Blanca' }).click();
    const qty = page.locator('#stock-list tr', { hasText: 'Blanco' }).locator('input[type="number"]');
    await expect(qty).toHaveValue('3');
    /* Entra una venta mientras el admin tiene la pantalla abierta: queda 1 */
    await page.evaluate(() => (window as any).__firebaseMock.setDoc('stock', '1',
      { variantes: { M: { Blanco: { cantidad: 1, hex: '#ffffff' } } } }));
    await qty.fill('7');
    await qty.blur();
    await expect.poll(async () => (await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(7);
    expect(dialogos.some(m => m.includes('cambió mientras editabas'))).toBe(true);
    const movs = Object.values(await getCollection(page, 'stock/1/movimientos')) as any[];
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ delta: 6, cantidadResultante: 7 });
  });

  test('el ajuste y su movimiento se escriben en la misma transacción @portal', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { stock: { '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' } } } } } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('stock');
    await portal.abrirSubtab('stock-import');
    await page.locator('#stock-csv-input').fill('1,M,Blanco,2,Ingreso');
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await expect(page.locator('#stock-import-status')).toContainText('1 movimiento');
    const log = await getFirebaseLog(page);
    const commit = log.find(e => e.op === 'tx-commit' && e.paths.some((p: string) => p === 'set:stock/1'));
    expect(commit.paths.some((p: string) => p.startsWith('set:stock/1/movimientos/'))).toBe(true);
  });
});

test.describe('Portal — publicar sin pisar cambios @portal @seguridad', () => {

  test('si productos.json cambió en GitHub desde que se abrió el portal, no publica y ofrece recargar @portal', async ({ page }) => {
    await setupPage(page);
    const portal = await entrarAlPortal(page, { rechazarConfirms: true });
    /* Otra pestaña/dispositivo publicó mientras tanto */
    const otro = catalogoFixture();
    otro.textos.footer.texto = 'Cambiado desde otra pestaña';
    const otroB64 = Buffer.from(JSON.stringify(otro, null, 2), 'utf8').toString('base64');
    await page.route(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/contents\/productos\.json/, async route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ path: 'productos.json', sha: 'sha-otra-pestaña', content: otroB64, encoding: 'base64' }) });
      }
      return route.fallback();
    });
    const dialogos: string[] = [];
    page.on('dialog', d => { dialogos.push(d.message()); });
    await page.evaluate('data.negocio.tagline = "cambio local"; markDirty();');
    await portal.publishBtn.click();
    await expect.poll(() => dialogos.some(m => m.includes('cambió desde que abriste el portal'))).toBe(true);
    expect(getGithubPuts(page).filter(p => p.path === 'productos.json')).toHaveLength(0);
    await expect(portal.saveBar).toBeVisible();   /* el cambio local sigue ahí */
  });
});
