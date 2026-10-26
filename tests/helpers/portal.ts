import { Page, expect } from '@playwright/test';
import { PortalPage } from '../pages/portal.page';

export const PAT_FAKE = 'ghp_fake_test_token_1234567890abcdef';
export const PASS_PORTAL = 'clave-de-test-123';

/**
 * Entra al portal con el flujo ACTUAL (PAT de GitHub + contraseña local) y
 * espera a que cargue productos.json desde la API de GitHub (mockeada en
 * setupPage).
 *
 * CUANDO SE AGREGUE EL LOGIN DE STAFF (Firebase Auth email/contraseña), este
 * helper es el ÚNICO lugar a adaptar: completar el formulario nuevo con
 * STAFF_EMAIL / STAFF_PASS (fixtures/test-data.ts). El mock ya acepta ese
 * usuario en signInWithEmailAndPassword y registra 'auth-password' en el log.
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
  await expect(portal.appScreen).toBeVisible();
  await expect(portal.saveStatus).toHaveText(/Sincronizado/, { timeout: 10_000 });
  return portal;
}

/** Bloque de un producto en el tab Catálogo, por id */
export function filaProducto(page: Page, id: number) {
  return page.locator('#cat-list > .item-row > div > div', { has: page.locator('.expandable-head', { hasText: new RegExp(`^.?\\s*#${id} ·`) }) });
}
