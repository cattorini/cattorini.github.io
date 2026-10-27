import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { PortalPage } from '../../pages/portal.page';
import { loginStaff } from '../../helpers/portal';

test.describe('Portal — autenticación @portal', () => {

  test('primera visita muestra pantalla de setup inicial @portal', async ({ page }) => {
    await setupPage(page);
    const portal = new PortalPage(page);
    await portal.goto();
    await expect(portal.loginFirst).toBeVisible();
    await expect(portal.inPat).toBeVisible();
    await expect(portal.inPass).toBeVisible();
    await expect(portal.inPass2).toBeVisible();
  });

  test('PAT inválido muestra error @portal', async ({ page }) => {
    await setupPage(page);
    const portal = new PortalPage(page);
    await portal.goto();
    await portal.setupInicial('invalid-pat', 'password123');
    await expect(portal.errSetup).toBeVisible();
    await expect(portal.errSetup).toContainText(/inválido/i);
  });

  test('contraseña < 8 caracteres es rechazada @portal', async ({ page }) => {
    await setupPage(page);
    const portal = new PortalPage(page);
    await portal.goto();
    await portal.setupInicial('ghp_' + 'x'.repeat(36), 'short');
    await expect(portal.errSetup).toContainText(/8 caracteres/i);
  });

  test('contraseñas que no coinciden son rechazadas @portal', async ({ page }) => {
    await setupPage(page);
    const portal = new PortalPage(page);
    await portal.goto();
    await portal.setupInicial('ghp_' + 'x'.repeat(36), 'password123', 'otherpassword');
    await expect(portal.errSetup).toContainText(/no coinciden/i);
  });

  test('setup exitoso pide la sesión de staff y después muestra la app @portal @critical', async ({ page }) => {
    await setupPage(page);
    const portal = new PortalPage(page);
    await portal.goto();
    await portal.setupInicial('ghp_' + 'x'.repeat(36), 'testpassword');
    /* Con solo el PAT no se entra: falta la sesión de staff de Firebase */
    await expect(page.locator('#login-staff')).toBeVisible();
    await expect(portal.appScreen).toBeHidden();
    await loginStaff(page);
    await expect(portal.appScreen).toBeVisible({ timeout: 10000 });
  });
});
