import { test, expect } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { ProductoPage } from '../../pages/producto.page';
import { loginStaff } from '../../helpers/portal';

const ahora = new Date();
const mes = (p: string) => p + ahora.getUTCFullYear() + String(ahora.getUTCMonth() + 1).padStart(2, '0');
const minorista = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' };

test.describe('Estadísticas por prenda @tienda @pedidos', () => {
  test('abrir la ficha y agregar al carrito suma 1, sin datos de la persona @tienda', async ({ page }) => {
    await setupPage(page, minorista);
    const prod = new ProductoPage(page);
    await prod.goto(1);
    await prod.esperarCarga();
    await expect.poll(async () => (await getCollection(page, 'estadisticas'))['1']).toEqual({ vistas: 1, [mes('v_')]: 1 });
    await prod.elegirTalle('M');
    await prod.agregarAlCarrito();
    await expect.poll(async () => (await getCollection(page, 'estadisticas'))['1'])
      .toEqual({ vistas: 1, [mes('v_')]: 1, carrito: 1, [mes('c_')]: 1 });
  });

  test('el panel muestra el ranking por período @pedidos', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { estadisticas: {
      1: { vistas: 40, carrito: 4, [mes('v_')]: 10, [mes('c_')]: 1 },
      4: { vistas: 90, carrito: 9, [mes('v_')]: 2 },
      999: { vistas: 5 }
    } } } });
    await page.goto('/pedidos.html');
    await loginStaff(page);
    await page.locator('.tab-btn[data-tab="vistos"]').click();
    const filas = page.locator('#vistos-tabla tr');
    await expect(filas).toHaveCount(4);
    await expect(filas.nth(1)).toContainText('90');
    await expect(filas.nth(1)).toContainText('10%');
    await expect(filas.nth(3)).toContainText('ya no está en el catálogo');
    await page.locator('#vistos-periodo [data-periodo="mes"]').click();
    await expect(filas.nth(1)).toContainText('10');
    await expect(filas).toHaveCount(3);
    await page.locator('#vistos-periodo [data-periodo="anterior"]').click();
    await expect(page.locator('#vistos-tabla')).toContainText('Todavía no hay visitas');
  });
});
