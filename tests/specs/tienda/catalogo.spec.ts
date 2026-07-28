import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';

test.describe('Tienda — catálogo y filtros @tienda @catalog', () => {

  test.beforeEach(async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Bahía Blanca',
      zonaStatus: 'libre'
    });
  });

  test('renderiza todas las categorías del JSON @tienda', async ({ page }) => {
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await expect(tienda.catalog).toBeVisible();
    await expect(tienda.catalog.locator('.cat-section')).toHaveCount(3);
    await expect(tienda.catalog).toContainText('Camisas');
    await expect(tienda.catalog).toContainText('Pantalones');
    await expect(tienda.catalog).toContainText('Jeans');
  });

  test('filtro por categoría oculta las demás @tienda', async ({ page }) => {
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.categoryPill('Camisas').click();
    await expect(tienda.catalog.locator('.cat-section[data-cat-id="camisas"]:not(.hidden-cat)')).toBeVisible();
    await expect(tienda.catalog.locator('.cat-section[data-cat-id="pantalones"]')).toHaveClass(/hidden-cat/);
  });

  test('buscador filtra por palabra clave @tienda', async ({ page }) => {
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.searchInput.fill('oxford');
    await page.waitForTimeout(200);
    const visibles = tienda.catalog.locator('.pcard:visible');
    const count = await visibles.count();
    expect(count).toBeGreaterThan(0);
  });

  test('búsqueda sin resultados oculta las secciones vacías @tienda', async ({ page }) => {
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.searchInput.fill('xyz123nomatch');
    await page.waitForTimeout(200);
    const secciones = tienda.catalog.locator('.cat-section:not(.hidden-cat)');
    await expect(secciones).toHaveCount(0);
  });

  test('botón X limpia el buscador @tienda', async ({ page }) => {
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.searchInput.fill('camisa');
    await tienda.searchClear.click();
    await expect(tienda.searchInput).toHaveValue('');
  });

  test('URL ?cat=camisas preselecciona esa categoría @tienda', async ({ page }) => {
    const tienda = new TiendaPage(page);
    await tienda.gotoConCat('camisas');
    await expect(tienda.categoryPill('Camisas')).toHaveClass(/active/);
  });
});
