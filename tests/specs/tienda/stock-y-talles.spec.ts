import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';
import { ProductoPage } from '../../pages/producto.page';

const minorista = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' };
/* fixture: 1 y 2 camisas (S..XXL), 4 y 5 pantalones (38..48). */
const STOCK = {
  1: { variantes: { M: { Blanco: { cantidad: 3, hex: '#fff' } }, L: { Blanco: { cantidad: 0, hex: '#fff' } } } },
  2: { variantes: { M: { Negro: { cantidad: 0, hex: '#000' } }, L: { Negro: { cantidad: 0, hex: '#000' } } } },
  4: { variantes: { '40': { Azul: { cantidad: 2, hex: '#00f' } }, '44': { Azul: { cantidad: 1, hex: '#00f' } } } }
};
const nombre = (c: any, id: number) => c.categorias.flatMap((x: any) => x.productos).find((p: any) => p.id === id).nombre;

test.describe('Stock en 0: guardado pero no visible @tienda', () => {
  test('la prenda con todo en 0 no aparece; sin stock cargado se muestra igual @tienda', async ({ page }) => {
    let n2 = '', n5 = '';
    await setupPage(page, { ...minorista, firebase: { collections: { stock: STOCK } }, mutarCatalogo: (c: any) => { n2 = nombre(c, 2); n5 = nombre(c, 5); } });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await expect(page.locator('.pcard[href*="id=1"]')).toHaveCount(1);
    await expect(page.locator('.pcard[href*="id=2"]')).toHaveCount(0);   // todo en 0
    await expect(page.locator('.pcard[href*="id=5"]')).toHaveCount(1);   // sin stock cargado: como antes
    void n2; void n5;
  });

  test('si el link de una prenda agotada se abre, avisa y no deja agregar @tienda', async ({ page }) => {
    await setupPage(page, { ...minorista, firebase: { collections: { stock: STOCK } } });
    const prod = new ProductoPage(page);
    await prod.goto(2);
    await prod.esperarCarga();
    await expect(page.locator('#sin-stock-msg')).toBeVisible();
    await expect(page.locator('#talles-grid .talle-btn')).toHaveCount(0);
    await expect(page.locator('#add-cart-btn')).toBeDisabled();
  });

  test('los destacados agotados no aparecen en la portada @landing', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { stock: STOCK } }, mutarCatalogo: (c: any) => {
      c.categorias.forEach((cat: any) => cat.productos.forEach((p: any) => { p.destacado = [1, 2].includes(p.id); }));
    } });
    await page.goto('/index.html');
    await expect(page.locator('#destacados-grid a[href*="id=1"]')).toHaveCount(1);
    await expect(page.locator('#destacados-grid a[href*="id=2"]')).toHaveCount(0);
  });
});

test.describe('Filtro por talle @tienda', () => {
  test('con "Todos" pide elegir categoría; en una categoría ofrece solo talles con stock @tienda', async ({ page }) => {
    await setupPage(page, { ...minorista, firebase: { collections: { stock: STOCK } } });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    const strip = page.locator('#talle-strip');
    await expect(strip).toContainText('elegí primero');
    await expect(strip.locator('.talle-pill')).toHaveCount(0);

    await page.locator('.cat-pill', { hasText: 'Pantalones' }).click();
    // 4 tiene stock en 40 y 44; 5 no tiene stock cargado y ofrece 38..46
    await expect(strip.locator('.talle-label')).toContainText('Talle de pantalones');
    await expect(strip.locator('.talle-pill')).toHaveText(['Todos', '38', '40', '42', '44', '46']);

    await strip.locator('.talle-pill', { hasText: /^40$/ }).click();
    await expect(page.locator('.pcard[href*="id=4"]')).toBeVisible();
    await expect(page.locator('.pcard[href*="id=5"]')).toBeVisible();
    await strip.locator('.talle-pill', { hasText: /^38$/ }).click();
    await expect(page.locator('.pcard[href*="id=4"]')).toBeHidden();
    await expect(page.locator('.pcard[href*="id=5"]')).toBeVisible();

    // cambiar de categoría limpia el talle elegido
    await page.locator('.cat-pill', { hasText: 'Camisas' }).click();
    await expect(strip.locator('.talle-pill.active')).toHaveText('Todos');
    // 1 solo tiene M con stock; 3 no tiene stock cargado y ofrece M..XXL
    await expect(strip.locator('.talle-pill')).toHaveText(['Todos', 'M', 'L', 'XL', 'XXL']);
  });

  test('sin resultados muestra un mensaje claro @tienda', async ({ page }) => {
    await setupPage(page, { ...minorista, firebase: { collections: { stock: STOCK } } });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await page.locator('.cat-pill', { hasText: 'Pantalones' }).click();
    await page.locator('#talle-strip .talle-pill', { hasText: /^44$/ }).click();
    await page.locator('#search').fill('zzz');
    await expect(page.locator('#sin-resultados')).toBeVisible();
    await page.locator('#search').fill('');
    await expect(page.locator('#sin-resultados')).toBeHidden();
  });
});
