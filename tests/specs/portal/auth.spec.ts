import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { PortalPage } from '../../pages/portal.page';

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

  test('setup exitoso muestra la app @portal @critical', async ({ page }) => {
    await setupPage(page);
    const portal = new PortalPage(page);
    await portal.goto();
    await portal.setupInicial('ghp_' + 'x'.repeat(36), 'testpassword');
    // Después del setup, se muestra la pantalla de app (loadRemote puede fallar por GH mock — no importa, verificamos que la app screen aparezca)
    await expect(portal.appScreen).toBeVisible({ timeout: 10000 });
  });
});
