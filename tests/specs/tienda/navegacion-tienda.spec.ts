import { test, expect } from '@playwright/test';
import { setupPage, catalogoFixture } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';
import { entrarAlPortal, filaProducto } from '../../helpers/portal';

const minorista = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' };

test.describe('Tienda: buscador y header @tienda', () => {
  test('el buscador arranca vacío al recargar y al volver atrás @tienda', async ({ page }) => {
    await setupPage(page, minorista);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await page.locator('#search').fill('camisa');
    await page.reload();
    await expect(page.locator('#search')).toHaveValue('');
    await page.locator('#search').fill('jean');
    await page.goto('/seguimiento.html');
    await page.goBack();
    await expect(page.locator('#search')).toHaveValue('');
  });

  test('el header se esconde al bajar y vuelve al subir @tienda', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await setupPage(page, { ...minorista, mutarCatalogo: (c: any) => {
      // catálogo largo para poder scrollear
      const base = c.categorias[0].productos[0];
      for (let i = 0; i < 20; i++) c.categorias[0].productos.push({ ...base, id: 900 + i, nombre: 'Camisa ' + i });
    } });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    const header = page.locator('header');
    await expect(header).not.toHaveClass(/header-oculto/);
    await page.mouse.wheel(0, 900);
    await expect(header).toHaveClass(/header-oculto/);
    await page.mouse.wheel(0, -200);
    await expect(header).not.toHaveClass(/header-oculto/);
  });
});

test.describe('Portada: historia y producción @landing', () => {
  test('la sección historia tiene el texto y los collages; el menú lleva a cada una @landing', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: (c: any) => {
      c.textos.historia = { titulo: 'Nuestra historia', texto: 'Se inició el 5 de Octubre de 1959.' };
      c.imagenes.historia_carousel = ['historia-1.jpg', 'historia-2.jpg'];
    } });
    await page.goto('/index.html');
    await expect(page.locator('#historia-titulo')).toHaveText('Nuestra historia');
    await expect(page.locator('#historia-texto')).toContainText('5 de Octubre de 1959');
    await expect(page.locator('#carousel-historia img')).toHaveCount(2);
    await expect(page.locator('nav a.nav-link[href="#historia"]')).toHaveCount(1);
    await expect(page.locator('nav a.nav-link[href="#produccion"]')).toHaveText('Producción');
    await expect(page.locator('#produccion #video-produccion')).toHaveCount(1);
  });
});

test.describe('Portal: ver foto en grande @portal', () => {
  test('click en la foto del producto la muestra grande y se cierra @portal', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: (c: any) => { c.categorias[0].productos[0].imagenes = ['cat-camisas.jpg']; } });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('catalogo');
    await filaProducto(page, 1).locator('.expandable-head').click();
    await page.locator('.img-thumb').first().click();
    await expect(page.locator('#img-grande img')).toHaveAttribute('src', /cat-camisas\.jpg/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#img-grande')).toHaveCount(0);
  });
});
void catalogoFixture;
