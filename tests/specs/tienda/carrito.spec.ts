import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';

test.describe('Carrito — drawer @tienda @carrito', () => {

  test('empty state cuando el carrito está vacío @carrito', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre'
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await expect(tienda.drawerBody).toContainText(/vacío/i);
    await expect(tienda.drawerFooter).toBeHidden();
  });

  test('carrito con items muestra líneas y footer con totales @carrito', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: [
        { id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 2, precio: 22000 },
        { id: 4, nombre: 'Pantalón de Vestir Negro', categoria: 'Pantalones', talle: '40', qty: 1, precio: 28000 }
      ]
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await expect(tienda.drawerBody.locator('.cart-item')).toHaveCount(2);
    await expect(tienda.drawerFooter).toBeVisible();
    // Subtotal esperado: 2×22000 + 28000 = 72000
    await expect(page.locator('#totals-box')).toContainText('72.000');
  });

  test('modificar cantidad recalcula el total @carrito', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: [{ id: 1, nombre: 'Camisa Oxford', categoria: 'Camisas', talle: 'M', qty: 1, precio: 22000 }]
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await page.locator('.cart-item-qty button', { hasText: '+' }).click();
    await expect(page.locator('#totals-box')).toContainText('44.000');
  });

  test('eliminar item con × lo remueve del carrito @carrito', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: [{ id: 1, nombre: 'Camisa Oxford', categoria: 'Camisas', talle: 'M', qty: 1, precio: 22000 }]
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await page.locator('.cart-item-del').click();
    await expect(tienda.drawerBody).toContainText(/vacío/i);
  });

  test('vaciar carrito pide confirmación @carrito', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: [{ id: 1, nombre: 'Camisa Oxford', categoria: 'Camisas', talle: 'M', qty: 1, precio: 22000 }]
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    page.on('dialog', d => d.accept());
    await page.locator('button', { hasText: 'Vaciar carrito' }).click();
    await expect(tienda.drawerBody).toContainText(/vacío/i);
  });
});
