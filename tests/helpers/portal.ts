import { Page, expect } from '@playwright/test';
import { PortalPage } from '../pages/portal.page';
import { STAFF_EMAIL, STAFF_PASS } from '../fixtures/test-data';

export const PAT_FAKE = 'ghp_fake_test_token_1234567890abcdef';
export const PASS_PORTAL = 'clave-de-test-123';

/** Completa el formulario de sesión de staff (Firebase Auth email/contraseña).
 *  Sirve igual en portal.html (#login-staff) y pedidos.html. */
export async function loginStaff(page: Page, email = STAFF_EMAIL, pass = STAFF_PASS) {
  await page.locator('#staff-email').waitFor({ state: 'visible' });
  await page.locator('#staff-email').fill(email);
  await page.locator('#staff-pass').fill(pass);
  await page.locator('#staff-btn').click();
}

/**
 * Entra al portal con el flujo completo:
 *  1) PAT de GitHub + contraseña local (para publicar productos.json),
 *  2) sesión de staff de Firebase (STAFF_EMAIL / STAFF_PASS, usuario que solo
 *     existe en el mock — ver fixtures/test-data.ts),
 * y espera a que cargue productos.json desde la API de GitHub (mockeada).
 */
export async function entrarAlPortal(page: Page, opts: { rechazarConfirms?: boolean } = {}) {
  const portal = new PortalPage(page);
  /* alert/prompt se aceptan; los confirm() se aceptan salvo rechazarConfirms
     (para verificar que una advertencia realmente frena la acción) */
  page.on('dialog', d => {
    const p = (opts.rechazarConfirms && d.type() === 'confirm') ? d.dismiss() : d.accept();
    p.catch(() => {});
  });
  await portal.goto();
  await portal.setupInicial(PAT_FAKE, PASS_PORTAL);
  await loginStaff(page);
  await expect(portal.appScreen).toBeVisible();
  await expect(portal.saveStatus).toHaveText(/Sincronizado/, { timeout: 10_000 });
  return portal;
}

/**
 * Entra a pedidos.html con la sesión de staff de Firebase y espera el
 * tablero. (Antes alcanzaba con sessionStorage catt_pedidos_session=ok, que
 * cualquiera podía setear desde la consola.)
 */
export async function entrarAPedidos(page: Page) {
  page.on('dialog', d => { d.accept().catch(() => {}); });
  await page.goto('/pedidos.html');
  await loginStaff(page);
  await expect(page.locator('#app-screen')).toBeVisible();
}

/** Bloque de un producto en el tab Catálogo, por id */
export function filaProducto(page: Page, id: number) {
  return page.locator('#cat-list > .item-row > div > div', { has: page.locator('.expandable-head', { hasText: new RegExp(`^.?\\s*#${id} ·`) }) });
}
