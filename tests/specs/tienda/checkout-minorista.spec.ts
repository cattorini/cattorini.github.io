import { test, expect } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';

const cartMinorista = [
  { id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 2, precio: 22000 }
];
const cartGrande = [
  { id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 5, precio: 22000 }
];

test.describe('Checkout minorista @tienda @checkout @minorista', () => {

  test('retiro no muestra campos de dirección @checkout', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: cartMinorista
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirRetiro();
    await expect(tienda.inpDireccion).toBeHidden();
  });

  test('envío muestra campos de dirección @checkout', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: cartMinorista
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await expect(tienda.inpDireccion).toBeVisible();
    await expect(tienda.inpProvinciaEnvio).toBeVisible();
    await expect(tienda.inpLocalidadEnvio).toBeVisible();
  });

  test('sin nombre no envía el pedido @checkout', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: cartMinorista
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.confirmarPedido();
    await expect(tienda.toast).toContainText(/nombre/i);
    // pedido no se creó
    const pedidos = await getCollection(page, 'pedidos');
    expect(Object.keys(pedidos).length).toBe(0);
  });

  test('envío sin dirección no envía el pedido @checkout', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: cartMinorista
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await tienda.inpNombre.fill('Ana Test');
    await tienda.confirmarPedido();
    await expect(tienda.toast).toContainText(/dirección/i);
  });

  test('envío gratis cuando supera el umbral @checkout', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: cartGrande  // 5×22000 = 110000 > 80000 umbral
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await expect(page.locator('#totals-box')).toContainText(/gratis/i);
  });

  test('envío con costo cuando no supera el umbral @checkout', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: cartMinorista  // 44000 < 80000
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    // Costo esperado: 4500 (por default en productos.json)
    await expect(page.locator('#totals-box')).toContainText('4.500');
  });

  test('flujo completo retiro genera código y guarda en Firestore @checkout @critical', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: cartMinorista
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirRetiro();
    await tienda.llenarDatosMinorista({ nombre: 'Ana Test' });
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toHaveClass(/open/);
    const code = await tienda.confirmCode.textContent();
    expect(code).toMatch(/#[A-Z0-9]{5}/);
    const pedidos = await getCollection(page, 'pedidos');
    const docs = Object.values(pedidos) as any[];
    expect(docs.length).toBe(1);
    expect(docs[0].cliente.nombre).toBe('Ana Test');
    expect(docs[0].cliente.perfil).toBe('minorista');
    expect(docs[0].modalidad).toBe('retiro');
    expect(docs[0].estado).toBe('pendiente');
  });
});
