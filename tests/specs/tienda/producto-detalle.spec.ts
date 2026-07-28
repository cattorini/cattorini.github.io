import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { ProductoPage } from '../../pages/producto.page';

test.describe('Producto detalle @tienda @producto', () => {

  test.beforeEach(async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Bahía Blanca',
      zonaStatus: 'libre'
    });
  });

  test('carga producto por id con nombre, precio y descripción @producto', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();
    await expect(producto.nombre).toContainText(/Camisa Oxford/i);
    await expect(producto.precio).toBeVisible();
    await expect(producto.desc).not.toBeEmpty();
  });

  test('id inexistente muestra "Producto no encontrado" @producto', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(9999);
    await expect(producto.notFound).toBeVisible({ timeout: 5000 });
  });

  test('botón agregar deshabilitado sin talle @producto', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();
    await expect(producto.addCartBtn).toBeDisabled();
  });

  test('al elegir talle se habilita agregar y se muestra en el label @producto', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();
    await producto.elegirTalle('L');
    await expect(producto.addCartBtn).toBeEnabled();
    await expect(producto.talleSelected).toHaveText('L');
  });

  test('cantidad se limita entre 1 y 999 @producto', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();
    await page.locator('.qty-ctrl button', { hasText: '−' }).click({ clickCount: 5 });
    await expect(producto.qtyInput).toHaveValue('1');
  });

  test('agregar al carrito muestra toast y actualiza contador @producto @carrito', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();
    await producto.elegirTalle('M');
    await producto.agregarAlCarrito();
    await expect(producto.toast).toHaveClass(/show/);
    await expect(producto.toast).toContainText(/Agregado/);
    await expect(producto.cartCount).toHaveText('1');
  });

  test('agregar dos veces el mismo talle consolida en una línea @producto @carrito', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();
    await producto.elegirTalle('M');
    await producto.agregarAlCarrito();
    await page.waitForTimeout(300);
    await producto.agregarAlCarrito();
    await expect(producto.cartCount).toHaveText('2');
    // La cantidad se suma pero es un solo item — verificamos vía localStorage
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('catt_cart_v2') || '[]'));
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
  });

  test('modal guía de talles abre y muestra la tabla @producto', async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();
    await producto.abrirGuiaTalles();
    await expect(producto.modalGuia).toBeVisible();
    await expect(producto.modalGuiaTabla).toContainText(/Talle/i);
    await producto.cerrarGuiaTalles();
    await expect(producto.modalGuia).toBeHidden();
  });
});
