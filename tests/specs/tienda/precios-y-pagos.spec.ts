import { test, expect } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';
import { ProductoPage } from '../../pages/producto.page';
import { SeguimientoPage } from '../../pages/seguimiento.page';
import { CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaSample, pedidoConEstado } from '../../fixtures/test-data';

const minorista = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' };
const carrito = [{ id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 2, precio: 22000, recargoTalle: 0 }];
const activos = (d: any) => ({ collections: { mayoristas_activos: { [CODIGO_MAYO_INDIVIDUAL_HASH]: d } } });
const mayorista = { perfil: 'mayorista' as const, codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: mayoristaSample, firebase: activos(mayoristaSample) };

test.describe('Precios por talle @tienda', () => {
  test('la ficha agrupa los talles y suma el recargo al precio @tienda', async ({ page }) => {
    await setupPage(page, minorista);
    const prod = new ProductoPage(page);
    await prod.goto(4);
    await prod.esperarCarga();
    await expect(page.locator('.talle-grupo-titulo')).toHaveText(['Talles comunes', 'Talles especiales · +14%', 'Talles superespeciales · +18%']);
    await expect(page.locator('#p-price')).toContainText('$30.000');
    await expect(page.locator('#talle-recargo-msg')).toBeHidden();

    await prod.elegirTalle('46');
    await expect(page.locator('#p-price')).toContainText('$34.200');
    await expect(page.locator('#talle-recargo-msg')).toContainText('recargo del 14%');

    await prod.elegirTalle('48');
    await expect(page.locator('#p-price')).toContainText('$35.400');
    await prod.agregarAlCarrito();
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('catt_cart_v2') || '[]'));
    expect(cart[0]).toMatchObject({ talle: '48', precio: 35400, recargoTalle: 18 });
  });

  test('producto sin rangos no muestra grupos ni recargo @tienda', async ({ page }) => {
    await setupPage(page, minorista);
    const prod = new ProductoPage(page);
    await prod.goto(1);
    await prod.esperarCarga();
    await expect(page.locator('.talle-grupo-titulo')).toHaveCount(0);
    await prod.elegirTalle('M');
    await expect(page.locator('#talle-recargo-msg')).toBeHidden();
  });

  test('el recargo también aplica al precio mayorista @mayorista', async ({ page }) => {
    await setupPage(page, mayorista);
    const prod = new ProductoPage(page);
    await prod.goto(4);
    await prod.esperarCarga();
    await prod.elegirTalle('46');
    await expect(page.locator('#p-price')).toContainText('$21.660');
    await expect(page.locator('#p-price')).toContainText('sin IVA');
  });

  test('un carrito viejo recibe el recargo una sola vez @tienda', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: [{ id: 4, nombre: 'Pantalón', categoria: 'Pantalones', talle: '46', qty: 1, precio: 30000 }] });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await page.reload();
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('catt_cart_v2') || '[]'));
    expect(cart[0]).toMatchObject({ precio: 34200, recargoTalle: 14 });
  });
});

test.describe('Medios de pago minorista @tienda @checkout', () => {
  test('la ficha avisa el descuento sin mostrar dos precios @minorista', async ({ page }) => {
    await setupPage(page, minorista);
    const prod = new ProductoPage(page);
    await prod.goto(1);
    await prod.esperarCarga();
    await expect(page.locator('#p-aviso-pago')).toContainText('10% de descuento sobre el valor final');
    await expect(page.locator('#p-aviso-pago')).toContainText('MercadoPago o MODO');
    await expect(page.locator('#p-price')).toContainText('$22.000');
    await expect(page.locator('#p-price')).not.toContainText('19.800');
  });

  test('el catálogo muestra el aviso en cada prenda @minorista', async ({ page }) => {
    await setupPage(page, minorista);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await expect(page.locator('.pcard-aviso').first()).toContainText('10% de descuento en efectivo o transferencia');
  });

  test('retiro: local y QR con descuento; envío no ofrece el local @minorista', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    const box = page.locator('#totals-box');
    await expect(page.locator('#tog-pago-local')).toHaveAttribute('aria-pressed', 'true');
    await expect(box).toContainText('Descuento por forma de pago');
    await expect(box.locator('.totals-row.total')).toContainText('39.600');

    await page.locator('#tog-pago-qr').click();
    await expect(box.locator('.totals-row.total')).toContainText('39.600');

    await tienda.elegirEnvio();
    await expect(page.locator('#tog-pago-local')).toHaveCount(0);
    await expect(page.locator('#tog-pago-qr')).toHaveAttribute('aria-pressed', 'true');
  });

  test('MercadoPago apagado no aparece; prendido no tiene descuento @minorista', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito, mutarCatalogo: (c: any) => { c.config.pago.mercadopago_activo = true; } });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await page.locator('#tog-pago-mp').click();
    await expect(page.locator('#tog-pago-mp')).toContainText('MercadoPago o MODO');
    await expect(page.locator('#totals-box')).not.toContainText('Descuento');
    await expect(page.locator('#totals-box .totals-row.total')).toContainText('44.000');

    const otra = await page.context().newPage();
    await setupPage(otra, { ...minorista, cart: carrito });
    const t2 = new TiendaPage(otra);
    await t2.goto();
    await t2.abrirCarrito();
    await expect(otra.locator('#tog-pago-mp')).toHaveCount(0);
  });

  test('el pedido guarda el método y el descuento; QR muestra el QR @checkout', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await page.locator('#tog-pago-qr').click();
    await tienda.llenarDatosMinorista({ nombre: 'Ana Prueba' });
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#confirm-pago-qr')).toBeVisible();
    const [p] = Object.values(await getCollection(page, 'pedidos')) as any[];
    expect(p).toMatchObject({ metodoPago: 'qr', pagaEnLocal: false, subtotal: 44000, descuentoPago: 4400, iva: 0, total: 39600 });
  });

  test('pago en el local: sin QR y mensaje de retiro @checkout', async ({ page }) => {
    await setupPage(page, { ...minorista, cart: carrito });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.llenarDatosMinorista({ nombre: 'Ana Prueba' });
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#confirm-pago-qr')).toBeHidden();
    await expect(page.locator('#confirm-msg')).toContainText('lo abonás en el local');
  });
});

test.describe('Mayorista: IVA y pago a convenir @tienda @mayorista', () => {
  const cartMayo = [{ id: 1, nombre: 'Camisa', categoria: 'Camisas', talle: 'M', qty: 5, precio: 14500, recargoTalle: 0 }];

  test('desglosa el IVA, sin selector de pago ni descuento @mayorista', async ({ page }) => {
    await setupPage(page, { ...mayorista, cart: cartMayo });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    const box = page.locator('#totals-box');
    await expect(box).toContainText('Subtotal sin IVA');
    await expect(box).toContainText('IVA (21%)');
    await expect(box).toContainText('15.225');
    await expect(box.locator('.totals-row.total')).toContainText('Total con IVA');
    await expect(box.locator('.totals-row.total')).toContainText('87.725');
    await expect(page.locator('#pago-convenir')).toContainText('a convenir');
    await expect(page.locator('#tog-pago-qr')).toHaveCount(0);
  });

  test('el mínimo se mide sin IVA @mayorista', async ({ page }) => {
    const justo = [{ ...cartMayo[0], qty: 3 }]; // 43.500 sin IVA, 52.635 con IVA; mínimo 50.000
    await setupPage(page, { ...mayorista, cart: justo });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await expect(page.locator('#minimo-warning')).toBeVisible();
  });

  test('la tarjeta del catálogo aclara que es sin IVA @mayorista', async ({ page }) => {
    await setupPage(page, mayorista);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await expect(page.locator('.pcard-aviso').first()).toHaveText('Precio sin IVA');
  });
});

test.describe('Seguimiento según forma de pago @seguimiento', () => {
  const COD = 'K7M2Q9X4PZ';
  const abrir = async (page: any, extra: any, estado = 'pendiente') => {
    const pedido = { ...pedidoConEstado(estado), modalidad: 'retiro', codigo: COD, ...extra };
    await setupPage(page, { firebase: { collections: { pedidos: { [COD]: pedido } } } });
    const seg = new SeguimientoPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.pedidoCard).toBeVisible({ timeout: 5000 });
  };

  test('retiro con pago en el local: pedido recibido, sin QR @seguimiento', async ({ page }) => {
    await abrir(page, { metodoPago: 'local', pagaEnLocal: true });
    await expect(page.locator('#step-label-1')).toHaveText('Pedido recibido');
    await expect(page.locator('#status-msg')).toContainText('Recibimos tu pedido');
    await expect(page.locator('#pago-qr-box')).toBeHidden();
  });

  test('retiro listo: informa la dirección del local @seguimiento', async ({ page }) => {
    await abrir(page, { metodoPago: 'local', pagaEnLocal: true }, 'listo');
    await expect(page.locator('#status-msg')).toContainText('Ya podés retirar tu pedido en');
  });

  test('mayorista a convenir: pendiente de pago, sin QR @seguimiento', async ({ page }) => {
    await abrir(page, { metodoPago: 'convenir', modalidad: 'envio' });
    await expect(page.locator('#step-label-1')).toHaveText('Pendiente de pago');
    await expect(page.locator('#status-msg')).toContainText('acordar la forma de pago');
    await expect(page.locator('#pago-qr-box')).toBeHidden();
  });

  test('pedido viejo sin metodoPago sigue funcionando @seguimiento', async ({ page }) => {
    await abrir(page, { modalidad: 'envio', pagaEnLocal: false });
    await expect(page.locator('#pago-qr-box')).toBeVisible();
  });
});
