import { test, expect } from '@playwright/test';
import { setupPage, waitAnimations } from '../../helpers/setup';
import { LandingPage } from '../../pages/landing.page';

test.describe('Landing — hero y navegación @landing', () => {
  test('el hero muestra título, subtítulo y CTAs @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await expect(landing.heroTitle).toBeVisible();
    /* Debe haber al menos 2 CTAs en el hero */
    const btnCount = await page.locator('.hero .btn').count();
    expect(btnCount).toBeGreaterThanOrEqual(2);
  });

  test('al llegar con hash #mayoristas se resalta el CTA con animación pulse @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.gotoConHashMayoristas();
    // Esperar a que aplique el pulse-highlight (delay 800ms en el código)
    await page.waitForTimeout(1000);
    await expect(landing.ctaMayorista).toHaveClass(/pulse-highlight/);
  });

  test('el link "Consultá el estado" apunta a la página de seguimiento mayorista @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await expect(landing.ctaConsultarSolicitud).toHaveAttribute('href', './seguimiento-mayorista.html');
  });

  test('el nav muestra badge Abierto/Cerrado @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    /* esperar a que se llene con Abierto o Cerrado (el default es "···") */
    await expect(landing.navEstado).toHaveText(/Abierto|Cerrado/, { timeout: 5000 });
  });

  test('categorías se renderizan dinámicamente desde el JSON @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await expect(landing.categoriasGrid.locator('.cat-card')).toHaveCount(3);
    await expect(landing.categoriasGrid).toContainText('Camisas');
    await expect(landing.categoriasGrid).toContainText('Pantalones');
    await expect(landing.categoriasGrid).toContainText('Jeans');
  });

  test('destacados: aparecen productos con destacado=true @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    const count = await landing.destacadosGrid.locator('.pcard').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(8);
  });
});
