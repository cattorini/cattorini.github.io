import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { SeguimientoMayoristaPage } from '../../pages/seguimiento-mayorista.page';
import { solicitudPendienteSample, solicitudAceptadaSample, solicitudRechazadaSample } from '../../fixtures/test-data';

test.describe('Seguimiento mayorista @seguimiento @mayorista', () => {

  test('sin código + mis solicitudes muestra la lista @seguimiento', async ({ page }) => {
    await setupPage(page, {
      misSolicitudes: [{ code: 'MAY-AAAA', docId: 'd', ts: Date.now() }]
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.goto();
    await expect(seg.searchCard).toBeVisible();
    await expect(seg.misSolicitudesCard).toBeVisible();
  });

  test('código inválido muestra not-found @seguimiento', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { solicitudes_mayoristas: {} } } });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo('MAY-NONE');
    await expect(seg.notFoundCard).toBeVisible({ timeout: 5000 });
  });

  test('estado pendiente muestra mensaje "en revisión" @seguimiento', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: { 'd1': solicitudPendienteSample } } }
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo(solicitudPendienteSample.codigo);
    await expect(seg.solicitudCard).toBeVisible({ timeout: 5000 });
    await expect(seg.statusBadge).toHaveText(/en revisión/i);
    await expect(seg.pendienteContent).toBeVisible();
  });

  test('estado aceptada muestra el código de acceso @seguimiento @critical', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: { 'd1': solicitudAceptadaSample } } }
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo(solicitudAceptadaSample.codigo);
    await expect(seg.solicitudCard).toBeVisible({ timeout: 5000 });
    await expect(seg.statusBadge).toHaveText(/aceptada/i);
    await expect(seg.aceptadaContent).toBeVisible();
    await expect(seg.codigoMayorista).toHaveText(solicitudAceptadaSample.respuesta.codigoMayorista);
  });

  test('estado rechazada muestra el motivo @seguimiento', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { solicitudes_mayoristas: { 'd1': solicitudRechazadaSample } } }
    });
    const seg = new SeguimientoMayoristaPage(page);
    await seg.gotoConCodigo(solicitudRechazadaSample.codigo);
    await expect(seg.solicitudCard).toBeVisible({ timeout: 5000 });
    await expect(seg.statusBadge).toHaveText(/rechazada/i);
    await expect(seg.rechazadaContent).toBeVisible();
    await expect(seg.rechazoMotivo).toContainText(solicitudRechazadaSample.respuesta.motivo);
  });
});
