import { test, expect, Page } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';
import { SeguimientoPage } from '../../pages/seguimiento.page';
import { pedidoConEstado } from '../../fixtures/test-data';
import { loginStaff } from '../../helpers/portal';

const WORKER = 'https://lfs-pagos.juliancarroccio.workers.dev';
const minorista = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' };
const carrito = [{ id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 2, precio: 22000, recargoTalle: 0 }];
const activar = (avisos = false) => (c: any) => { c.config.pago.mercadopago_activo = true; c.config.pago.avisos_activos = avisos; };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };

/* Simula el Worker y MercadoPago. Devuelve los llamados recibidos. */
async function worker(page: Page, respuesta: { status?: number; body?: any } = {}) {
  const llamados: { ruta: string; body: any }[] = [];
  await page.route(WORKER + '/**', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const ruta = new URL(r.request().url()).pathname;
    llamados.push({ ruta, body: r.request().postDataJSON() });
    if (ruta.endsWith('/notificar')) return r.fulfill({ status: 200, headers: CORS, json: { ok: true } });
    return r.fulfill({
      status: respuesta.status ?? 200, headers: CORS,
      json: respuesta.body ?? { init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=x', monto: 44000 }
    });
  });
  await page.route('https://www.mercadopago.com.ar/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>MercadoPago de prueba</h1>' }));
  return llamados;
}

async function comprarConMp(page: Page) {
  const tienda = new TiendaPage(page);
  await tienda.goto();
  await tienda.abrirCarrito();
  await page.locator('#tog-pago-mp').click();
  await tienda.llenarDatosMinorista({ nombre: 'Ana Prueba' });
  await tienda.confirmarPedidoBtn();
}

test.describe('Pago con MercadoPago @tienda @checkout', () => {
  test('crea el pedido sin descuento, manda solo el código y redirige @checkout', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito, mutarCatalogo: activar() });
    const llamados = await worker(page);
    await comprarConMp(page);
    await page.waitForURL(/mercadopago\.com\.ar/);
    expect(llamados).toHaveLength(1);
    expect(llamados[0].ruta).toBe('/v1/cattorini/checkout');
    expect(Object.keys(llamados[0].body)).toEqual(['codigo']);
  });

  test('si el Worker falla, el pedido queda y lo lleva a seguimiento @checkout', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito, mutarCatalogo: activar() });
    await worker(page, { status: 502, body: { error: 'MP_CAIDO' } });
    await comprarConMp(page);
    await page.waitForURL(/seguimiento\.html\?code=/);
  });

  test('un link de pago de otro dominio no se abre @checkout @seguridad', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito, mutarCatalogo: activar() });
    await worker(page, { body: { init_point: 'https://estafa.example/pago' } });
    await comprarConMp(page);
    await page.waitForURL(/seguimiento\.html\?code=/);
    expect(page.url()).not.toContain('estafa');
  });
});

test.describe('Aviso de venta @tienda', () => {
  const comprarEnLocal = async (page: Page) => {
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.llenarDatosMinorista({ nombre: 'Ana Prueba' });
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });
  };

  test('avisa con solo el código cuando está activado @tienda', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito, mutarCatalogo: activar(true) });
    const llamados = await worker(page);
    await comprarEnLocal(page);
    await expect.poll(() => llamados.length).toBe(1);
    expect(llamados[0].ruta).toBe('/v1/cattorini/notificar');
    expect(Object.keys(llamados[0].body)).toEqual(['codigo']);
  });

  test('apagado no llama al Worker; si falla no frena la compra @tienda', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito });
    const llamados = await worker(page);
    await comprarEnLocal(page);
    expect(llamados).toHaveLength(0);

    const otra = await page.context().newPage();
    await setupPage(otra, { ...minorista, cart: carrito, mutarCatalogo: activar(true) });
    await otra.route(WORKER + '/**', (r) => r.abort());
    await comprarEnLocal(otra);
    expect(Object.keys(await getCollection(otra, 'pedidos'))).toHaveLength(1);
  });
});

test.describe('Seguimiento de un pago online @seguimiento', () => {
  const COD = 'K7M2Q9X4PZ';
  const abrir = async (page: Page, pago: any, url = `/seguimiento.html?code=${COD}`) => {
    const pedido = { ...pedidoConEstado('pendiente'), codigo: COD, metodoPago: 'mercadopago', pago };
    await setupPage(page, { firebase: { collections: { pedidos: { [COD]: pedido } } } });
    await page.goto(url);
    await expect(new SeguimientoPage(page).pedidoCard).toBeVisible({ timeout: 5000 });
  };

  test('la vuelta con status=approved NO lo muestra como pagado @seguimiento @seguridad', async ({ page }) => {
    await abrir(page, { metodo: 'mercadopago', estado: 'iniciado' }, `/seguimiento.html?code=${COD}&status=approved&collection_status=approved`);
    await expect(page.locator('#pago-mp-msg')).toContainText('Todavía no recibimos tu pago');
    await expect(page.locator('#pago-mp-btn')).toBeVisible();
    await expect(page.locator('#pago-mp-box')).not.toContainText('Pago recibido');
  });

  test('rechazado permite reintentar y abre MercadoPago @seguimiento', async ({ page }) => {
    await abrir(page, { metodo: 'mercadopago', estado: 'rechazado' });
    await worker(page);
    await expect(page.locator('#pago-mp-msg')).toContainText('rechazó');
    await page.locator('#pago-mp-btn').click();
    await page.waitForURL(/mercadopago\.com\.ar/);
  });

  test('aprobado no ofrece pagar @seguimiento', async ({ page }) => {
    await abrir(page, { metodo: 'mercadopago', estado: 'aprobado' });
    await expect(page.locator('#pago-mp-msg')).toContainText('Pago recibido');
    await expect(page.locator('#pago-mp-btn')).toBeHidden();
  });

  test('el pedido por QR no muestra el bloque de MercadoPago @seguimiento', async ({ page }) => {
    const pedido = { ...pedidoConEstado('pendiente'), codigo: COD, metodoPago: 'qr' };
    await setupPage(page, { firebase: { collections: { pedidos: { [COD]: pedido } } } });
    await page.goto(`/seguimiento.html?code=${COD}`);
    await expect(new SeguimientoPage(page).pedidoCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#pago-mp-box')).toBeHidden();
    await expect(page.locator('#pago-qr-box')).toBeVisible();
  });
});

test.describe('Panel: pagos online @pedidos', () => {
  test('lista solo los pedidos con MercadoPago, sin botón para marcarlos @pedidos', async ({ page }) => {
    const base = { ...pedidoConEstado('preparando'), creadoEn: '2026-11-06T12:00:00Z' };
    await setupPage(page, { firebase: { collections: { pedidos: {
      MPMPMPMP01: { ...base, codigo: 'MPMPMPMP01', metodoPago: 'mercadopago', total: 44000, pago: { metodo: 'mercadopago', estado: 'aprobado', medio: 'credit_card', cuotas: 3 } },
      QRQRQRQR01: { ...base, codigo: 'QRQRQRQR01', metodoPago: 'qr' }
    } } } });
    await page.goto('/pedidos.html');
    await loginStaff(page);
    await page.locator('.tab-btn[data-tab="pagos"]').click();
    const panel = page.locator('#pagos-online');
    await expect(panel).toContainText('MPMPMPMP01');
    await expect(panel).not.toContainText('QRQRQRQR01');
    await expect(panel).not.toContainText(/Marcar/i);
  });
});
