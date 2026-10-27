/**
 * LEGAL (Argentina) — FALLAN HOY.
 *
 *  - Res. SCI 424/2020: "Botón de arrepentimiento" con acceso fácil y
 *    directo desde la página de INICIO del sitio de venta online.
 *  - Ley 24.240 art. 4 / Res. 270/2020 (ex SCI): identificación del
 *    proveedor (razón social, CUIT, domicilio) en la oferta online.
 *  - Ley 25.326 (datos personales): política de privacidad; el sitio junta
 *    nombre, dirección, WhatsApp, email, CUIT y foto del negocio.
 *  - Términos y condiciones de venta (cambios/devoluciones, envíos, precios).
 */
import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';

test.describe('Legal y datos del proveedor @seguridad @legal', () => {

  test('la home tiene un "Botón de arrepentimiento" visible que lleva a un formulario/página @legal', async ({ page }) => {
    await setupPage(page);
    await page.goto('/index.html');
    const link = page.getByRole('link', { name: /arrepentimiento/i }).first();
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toBeTruthy();
  });

  test('la tienda también expone el botón de arrepentimiento @legal', async ({ page }) => {
    await setupPage(page, { perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' });
    await page.goto('/tienda.html');
    await expect(page.getByRole('link', { name: /arrepentimiento/i }).first()).toBeAttached();
  });

  test('la home enlaza política de privacidad y términos y condiciones @legal', async ({ page }) => {
    await setupPage(page);
    await page.goto('/index.html');
    await expect(page.getByRole('link', { name: /privacidad/i }).first()).toBeAttached();
    await expect(page.getByRole('link', { name: /t[ée]rminos/i }).first()).toBeAttached();
  });

  test('el pie identifica al proveedor: razón social y CUIT @legal', async ({ page }) => {
    await setupPage(page);
    await page.goto('/index.html');
    const footer = page.locator('footer');
    await expect(footer).toContainText(/CUIT\s*:?\s*\d{2}-?\d{8}-?\d/i);
    await expect(footer).toContainText(/S\.?\s?A\.?|S\.?R\.?L\.?|raz[oó]n social/i);
  });

  test('el formulario de solicitud mayorista informa el uso de los datos (Ley 25.326) @legal', async ({ page }) => {
    await setupPage(page);
    await page.goto('/index.html');
    await page.evaluate(() => (window as any).openMayForm());
    await expect(page.locator('#may-modal')).toContainText(/privacidad|datos personales|25\.326/i);
  });
});
