import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { ProductoPage } from '../../pages/producto.page';
import { entrarAlPortal } from '../../helpers/portal';

const STOCK = { 1: { variantes: { M: {
  Blanco: { cantidad: 3, hex: '#ffffff' },
  'Raya azul': { cantidad: 2, hex: '#000000' },
  'Cuadro rojo': { cantidad: 0, hex: '#000000' }
} } } };
const conFantasias = (c: any) => {
  c.categorias[0].productos[0].fantasias = {
    'Raya azul': { tipo: 'raya', foto: 'cat-camisas.jpg' },
    'Cuadro rojo': { tipo: 'cuadro', foto: 'cat-jeans.jpg' },
    Maliciosa: { tipo: 'raya', foto: '../x"onerror=alert(1)' }
  };
};
const abrir = async (page: any) => {
  await setupPage(page, {
    perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
    firebase: { collections: { stock: STOCK } }, mutarCatalogo: conFantasias
  });
  const prod = new ProductoPage(page);
  await prod.goto(1);
  await prod.esperarCarga();
  await prod.elegirTalle('M');
};

test.describe('Fantasías @tienda', () => {
  test('la fantasía muestra foto; el liso, su color @tienda', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('.color-swatch.foto')).toHaveCount(2);
    await expect(page.locator('.color-chip', { hasText: 'Blanco' }).locator('.color-swatch.foto')).toHaveCount(0);
    await expect(page.locator('.fantasia-zoom')).toHaveCount(2);
  });

  test('ampliar, recorrer y elegir desde la ampliación @tienda', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: 'Ampliar Raya azul' }).click();
    const modal = page.locator('#modal-fantasia');
    await expect(modal).toBeVisible();
    await expect(page.locator('#fantasia-nombre')).toHaveText('Raya azul · Raya');
    await expect(page.locator('#fantasia-img')).toHaveAttribute('src', /cat-camisas/);

    await page.getByRole('button', { name: 'Fantasía siguiente' }).click();
    await expect(page.locator('#fantasia-nombre')).toHaveText('Cuadro rojo · Cuadro');
    await expect(page.locator('#fantasia-elegir')).toBeDisabled();

    await page.getByRole('button', { name: 'Fantasía anterior' }).click();
    await page.locator('#fantasia-elegir').click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#color-selected')).toHaveText('Raya azul');
    await expect(page.locator('#add-cart-btn')).toBeEnabled();
  });

  test('Escape cierra la ampliación @tienda', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: 'Ampliar Raya azul' }).click();
    await expect(page.locator('#modal-fantasia')).toBeVisible();
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-fantasia')).toBeHidden();
  });

  test('un nombre de archivo inválido no se usa como foto @tienda @seguridad', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      firebase: { collections: { stock: { 1: { variantes: { M: { Maliciosa: { cantidad: 1, hex: '#123456' } } } } } } },
      mutarCatalogo: conFantasias
    });
    const prod = new ProductoPage(page);
    await prod.goto(1);
    await prod.esperarCarga();
    await prod.elegirTalle('M');
    await expect(page.locator('.color-swatch.foto')).toHaveCount(0);
    await expect(page.locator('.fantasia-zoom')).toHaveCount(0);
  });
});

test.describe('Portal: ajustes nuevos @portal', () => {
  test('los talles se ordenan de menor a mayor @portal', async ({ page }) => {
    await setupPage(page);
    await entrarAlPortal(page);
    const ordenados = await page.evaluate(() => ['44', '38', '40', 'L', '100'].sort((window as any).compararTalles));
    expect(ordenados).toEqual(['38', '40', '44', '100', 'L']);
  });

  test('la portada rechaza una foto fuera de medida e informa el requisito @portal', async ({ page }) => {
    await setupPage(page);
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('imagenes');
    await expect(page.locator('#hero-requisitos')).toContainText('1000 × 1250');
    const veredicto = (w: number, h: number) => page.evaluate(async ([ww, hh]) => {
      const c = document.createElement('canvas'); c.width = ww; c.height = hh;
      const blob: Blob = await new Promise(r => c.toBlob(b => r(b as Blob), 'image/png'));
      return (window as any).problemaFotoPortada(new File([blob], 'a.png', { type: 'image/png' }));
    }, [w, h]);
    expect(await veredicto(800, 600)).toContain('mínimo');
    expect(await veredicto(1600, 1280)).toContain('4:5');
    expect(await veredicto(1032, 1280)).toBeNull();
  });
});
