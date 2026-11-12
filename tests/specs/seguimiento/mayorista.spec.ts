import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { SeguimientoMayoristaPage } from '../../pages/seguimiento-mayorista.page';
import { solicitudPendienteSample, solicitudAceptadaSample, solicitudRechazadaSample } from '../../fixtures/test-data';

/* Modelo nuevo: el doc ID ES el código MAY-XXXXXXXXXX. */
const COD = 'MAY-K7M2Q9X4PZ';
const conCodigo = (s: any) => ({ [COD]: { ...s, codigo: COD } });

test.describe('Seguimiento mayorista @seguimiento @mayorista', () => {

  test('sin código + mis solicitudes muestra la lista @seguimiento', async ({ page }) => {
    await setupPage(page, {
      misSolicitudes: [{ code: COD, docId: COD, ts: Date.now() }]
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.goto();
    await expect(seg.searchCard).toBeVisible();
    await expect(seg.misSolicitudesCard).toBeVisible();
  });

  test('código inválido muestra not-found @seguimiento', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { solicitudes_mayoristas: {} } } });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo('MAY-NNNNNNNNNN');
    await expect(seg.notFoundCard).toBeVisible({ timeout: 5000 });
  });

  test('estado pendiente muestra mensaje "en revisión" @seguimiento', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: conCodigo(solicitudPendienteSample) } }
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.solicitudCard).toBeVisible({ timeout: 5000 });
    await expect(seg.statusBadge).toHaveText(/en revisión/i);
    await expect(seg.pendienteContent).toBeVisible();
  });

  test('estado aceptada NO muestra el código de acceso (lo manda el staff por WhatsApp) @seguimiento @critical', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: conCodigo(solicitudAceptadaSample) } }
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.solicitudCard).toBeVisible({ timeout: 5000 });
    await expect(seg.statusBadge).toHaveText(/aceptada/i);
    await expect(seg.aceptadaContent).toBeVisible();
    await expect(page.locator('body')).not.toContainText(solicitudAceptadaSample.respuesta.codigoMayorista);
    await expect(seg.codigoMayoristaMsg).toContainText(/una sola vez/);
    await expect(page.locator('#code-display')).toBeHidden();
  });

  test('aceptada: el código se pide al Worker con un click y se muestra una vez @seguimiento @critical', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { solicitudes_mayoristas: conCodigo(solicitudAceptadaSample) } } });
    const pedidos: any[] = [];
    let respuesta: any = { status: 200, json: { codigo: 'CATT-ABCDEFGHJK' } };
    await page.route('https://lfs-pagos.juliancarroccio.workers.dev/**', async (r) => {
      const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      pedidos.push(r.request().postDataJSON());
      return r.fulfill({ status: respuesta.status, headers: CORS, json: respuesta.json });
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.aceptadaContent).toBeVisible({ timeout: 5000 });
    expect(pedidos).toHaveLength(0); // no se pide solo al abrir
    await page.locator('#ver-codigo-btn').click();
    await expect(page.locator('#codigo-acceso')).toHaveText('CATT-ABCDEFGHJK');
    expect(pedidos).toEqual([{ solicitud: COD }]);

    respuesta = { status: 404, json: { error: 'NO_DISPONIBLE' } };
    await page.reload();
    await page.locator('#ver-codigo-btn').click();
    await expect(page.locator('#ver-codigo-err')).toContainText('ya se mostró');
    await expect(page.locator('#codigo-acceso-box')).toBeHidden();
  });

  test('estado rechazada muestra el motivo @seguimiento', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: conCodigo(solicitudRechazadaSample) } }
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.solicitudCard).toBeVisible({ timeout: 5000 });
    await expect(seg.statusBadge).toHaveText(/rechazada/i);
    await expect(seg.rechazadaContent).toBeVisible();
    await expect(seg.rechazoMotivo).toContainText(solicitudRechazadaSample.respuesta.motivo);
  });
});
