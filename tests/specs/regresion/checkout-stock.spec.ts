/**
 * REGRESIÓN (deben pasar hoy y después de los arreglos de seguridad).
 * Checkout minorista y mayorista con descuento de stock por talle/color,
 * guía de talles en la ficha de producto y seguimiento por código.
 *
 * Los asserts NO dependen de detalles que el arreglo de seguridad va a
 * cambiar a propósito (ID del doc del pedido, largo del código, si el
 * movimiento se escribe dentro o fuera de la transacción): se busca el pedido
 * por su campo `codigo` y se compara contra el código que ve el cliente.
 */
import { test, expect, Page } from '@playwright/test';
import { setupPage, getCollection, getFirebaseBackendRequests } from '../../helpers/setup';
import { ProductoPage } from '../../pages/producto.page';
import { TiendaPage } from '../../pages/tienda.page';
import { CODIGO_MAYO_INDIVIDUAL, CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaSample } from '../../fixtures/test-data';

const STOCK = {
  '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' }, Azul: { cantidad: 0, hex: '#0000ff' } }, L: { Blanco: { cantidad: 10, hex: '#ffffff' } } } }
};

async function codigoConfirmado(page: Page) {
  const t = (await page.locator('#confirm-code').textContent()) || '';
  return t.replace('#', '').trim();
}

async function pedidoPorCodigo(page: Page, codigo: string) {
  const pedidos = Object.values(await getCollection(page, 'pedidos')) as any[];
  return pedidos.filter(p => p.codigo === codigo);
}

test.describe('Checkout con stock por talle/color @regresion @checkout', () => {

  test('ficha de producto: talles según guía, colores con stock y "sin stock" deshabilitado @regresion', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      firebase: { collections: { stock: STOCK } }
    });
    const prod = new ProductoPage(page);
    await prod.goto(1);
    await prod.esperarCarga();
    /* talles = claves de la guía "camisas" (S..XXL), todos disponibles en el fixture */
    await expect(page.locator('#talles-grid button')).toHaveText(['S', 'M', 'L', 'XL', 'XXL']);
    await prod.elegirTalle('M');
    await expect(page.locator('#colores-grid .color-chip')).toHaveCount(2);
    await expect(page.locator('#colores-grid .color-chip', { hasText: 'Azul' })).toBeDisabled();
    await expect(page.locator('#add-cart-btn')).toBeDisabled();   // falta elegir color
    await page.locator('#colores-grid .color-chip', { hasText: 'Blanco' }).click();
    await expect(page.locator('#add-cart-btn')).toBeEnabled();
    await expect(page.locator('#stock-info')).toContainText('Últimas 3');

    await prod.abrirGuiaTalles();
    await expect(prod.modalGuiaTabla.locator('tbody tr')).toHaveCount(5);
    await expect(prod.modalGuiaTabla).toContainText('Pecho');
  });

  test('guía de talles con comillas en el nombre (Jeans Catto"s) se muestra @regresion', async ({ page }) => {
    await setupPage(page, { perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' });
    const prod = new ProductoPage(page);
    await prod.goto(7);
    await prod.esperarCarga();
    await expect(page.locator('#talles-grid button')).toHaveCount(6);
    await prod.abrirGuiaTalles();
    await expect(prod.modalGuiaTabla.locator('tbody tr')).toHaveCount(6);
  });

  test('minorista: compra con color descuenta stock, crea pedido y movimiento @regresion @minorista', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      firebase: { collections: { stock: STOCK } }
    });
    const prod = new ProductoPage(page);
    await prod.goto(1);
    await prod.esperarCarga();
    await prod.elegirTalle('M');
    await page.locator('#colores-grid .color-chip', { hasText: 'Blanco' }).click();
    await prod.setQty(2);
    await prod.agregarAlCarrito();

    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirRetiro();
    await tienda.llenarDatosMinorista({ nombre: 'Cliente Regresión' });
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });

    const codigo = await codigoConfirmado(page);
    expect(codigo).toMatch(/^[A-Z0-9]{5,20}$/);
    const pedidos = await pedidoPorCodigo(page, codigo);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ estado: 'pendiente', modalidad: 'retiro', subtotal: 44000, total: 44000 });
    expect(pedidos[0].items[0]).toMatchObject({ id: 1, talle: 'M', color: 'Blanco', qty: 2, precio: 22000 });
    expect(pedidos[0].cliente).toMatchObject({ nombre: 'Cliente Regresión', perfil: 'minorista' });

    await expect.poll(async () => (await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(1);
    /* El resto del stock no se toca */
    const st = (await getCollection(page, 'stock'))['1'].variantes;
    expect(st.L.Blanco.cantidad).toBe(10);
    expect(st.M.Azul.cantidad).toBe(0);
    expect(st.M.Blanco.hex).toBe('#ffffff');

    await expect.poll(async () => Object.values(await getCollection(page, 'stock/1/movimientos')).length).toBe(1);
    const mov = Object.values(await getCollection(page, 'stock/1/movimientos'))[0] as any;
    expect(mov).toMatchObject({ talle: 'M', color: 'Blanco', delta: -2, cantidadResultante: 1, motivo: 'Venta #' + codigo });

    /* El link de seguimiento apunta al código */
    await expect(page.locator('#track-link')).toHaveAttribute('href', new RegExp(`seguimiento\\.html\\?code=${codigo}$`));
    expect(getFirebaseBackendRequests(page)).toEqual([]);
  });

  test('minorista: sin stock suficiente no crea pedido ni toca stock @regresion @minorista', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      firebase: { collections: { stock: STOCK } },
      cart: [{ key: '1__M__Blanco', id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', color: 'Blanco', qty: 5, precio: 22000 }]
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirRetiro();
    await tienda.llenarDatosMinorista({ nombre: 'Cliente' });
    await tienda.confirmarPedido();
    await expect(tienda.toast).toContainText(/Sin stock suficiente/);
    expect(Object.keys(await getCollection(page, 'pedidos'))).toHaveLength(0);
    expect((await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(3);
  });

  test('mayorista: precio mayorista, datos del mayorista y descuento de stock @regresion @mayorista', async ({ page }) => {
    await setupPage(page, {
      /* contrato de seguridad: sin código maestro, el perfil se revalida
         contra mayoristas_activos/{sha256(código individual)} */
      perfil: 'mayorista', codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: mayoristaSample,
      firebase: { collections: { stock: STOCK, mayoristas_activos: { [CODIGO_MAYO_INDIVIDUAL_HASH]: mayoristaSample } } },
      cart: [{ key: '1__L__Blanco', id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'L', color: 'Blanco', qty: 4, precio: 14500 }]
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });

    const codigo = await codigoConfirmado(page);
    const pedidos = await pedidoPorCodigo(page, codigo);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].cliente).toMatchObject({ perfil: 'mayorista', nombre: mayoristaSample.nombre, negocio: mayoristaSample.negocio });
    expect(pedidos[0].items[0]).toMatchObject({ talle: 'L', color: 'Blanco', qty: 4, precio: 14500 });
    expect(pedidos[0].subtotal).toBe(58000);
    await expect.poll(async () => (await getCollection(page, 'stock'))['1'].variantes.L.Blanco.cantidad).toBe(6);
  });

  test('mayorista: catálogo muestra precio mayorista con un código individual activo @regresion @mayorista', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { mayoristas_activos: { [CODIGO_MAYO_INDIVIDUAL_HASH]: mayoristaSample } } } });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.elegirMayorista();
    await tienda.ingresarCodigoMayorista(CODIGO_MAYO_INDIVIDUAL);
    await expect(tienda.catalog).toBeVisible();
    await expect(tienda.productCard('Camisa Oxford Blanca')).toContainText('14.500');
  });

  test('producto sin stock cargado (modo legado) se puede comprar sin color @regresion', async ({ page }) => {
    await setupPage(page, { perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' });
    const prod = new ProductoPage(page);
    await prod.goto(2);
    await prod.esperarCarga();
    await prod.elegirTalle('M');
    await expect(page.locator('#colores-section')).toBeHidden();
    await expect(page.locator('#add-cart-btn')).toBeEnabled();
    await prod.agregarAlCarrito();
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('catt_cart_v2') || '[]'));
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ id: 2, talle: 'M', color: null });
  });
});
