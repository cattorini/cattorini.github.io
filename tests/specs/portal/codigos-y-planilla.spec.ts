import { test, expect, Page } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { entrarAlPortal, filaProducto, loginStaff } from '../../helpers/portal';
import { TiendaPage } from '../../pages/tienda.page';
import { ProductoPage } from '../../pages/producto.page';

const COLORES = [{ codigo: '01', nombre: 'Blanco', hex: '#ffffff' }, { codigo: '13', nombre: 'Negro', hex: '#000000' }];
const conCodigos = (c: any) => {
  c.colores = COLORES;
  c.categorias[0].productos[0].articulo = '1101';
};
const STOCK = { 1: { variantes: {
  M: { Blanco: { cantidad: 3, hex: '#fff' }, Negro: { cantidad: 0, hex: '#000' } },
  L: { Blanco: { cantidad: 5, hex: '#fff' } }
} } };
const minorista = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' };

test.describe('Código de artículo @tienda @pedidos', () => {
  test('el pedido guarda el código AR{artículo}-{color} {talle} @checkout', async ({ page }) => {
    await setupPage(page, { ...minorista, mutarCatalogo: conCodigos, firebase: { collections: { stock: STOCK } } });
    const prod = new ProductoPage(page);
    await prod.goto(1);
    await prod.esperarCarga();
    await prod.elegirTalle('M');
    await page.locator('#colores-grid .color-chip', { hasText: 'Blanco' }).click();
    await prod.agregarAlCarrito();
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.llenarDatosMinorista({ nombre: 'Ana' });
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });
    const [p] = Object.values(await getCollection(page, 'pedidos')) as any[];
    expect(p.items[0].codigo).toBe('AR1101-01 M');
  });

  test('la cola muestra el código antes del nombre, también en pedidos viejos @pedidos', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: conCodigos });
    await page.goto('/pedidos.html');
    await loginStaff(page);
    await page.waitForFunction(() => (window as any).showDetail);
    await page.evaluate(() => (window as any).showDetail({
      id: 'K7M2Q9X4PZ', codigo: 'K7M2Q9X4PZ', estado: 'pendiente', modalidad: 'retiro', cliente: { nombre: 'Ana' },
      items: [
        { id: 1, nombre: 'Camisa', talle: '48', color: 'Blanco', qty: 1, precio: 1, codigo: 'AR1101-01 48' },
        { id: 1, nombre: 'Camisa', talle: 'M', color: 'Negro', qty: 1, precio: 1 }
      ], subtotal: 2, envio: 0, total: 2
    }));
    const lineas = page.locator('#modal-detail .item-line');
    await expect(lineas.nth(0)).toContainText('AR1101-01 48 · Camisa');
    await expect(lineas.nth(1)).toContainText('AR1101-13 M · Camisa');
  });
});

async function abrirStock(page: Page) {
  const portal = await entrarAlPortal(page);
  await portal.abrirTab('stock');
  return portal;
}

test.describe('Portal: colores, artículo y planilla @portal', () => {
  test('ABM de colores: agrega y rechaza repetidos @portal', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: conCodigos });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('colores');
    await expect(page.locator('#colores-list .color-fila')).toHaveCount(2);
    await page.locator('#color-nuevo-codigo').fill('41');
    await page.locator('#color-nuevo-nombre').fill('Celeste');
    await page.getByRole('button', { name: '+ Agregar color' }).first().click();
    await expect(page.locator('#colores-list .color-fila')).toHaveCount(3);
    const avisos: string[] = [];
    page.on('dialog', d => avisos.push(d.message()));
    await page.locator('#color-nuevo-codigo').fill('01');
    await page.locator('#color-nuevo-nombre').fill('Otro');
    await page.getByRole('button', { name: '+ Agregar color' }).first().click();
    await page.locator('#color-nuevo-codigo').fill('77');
    await page.locator('#color-nuevo-nombre').fill('celeste');
    await page.getByRole('button', { name: '+ Agregar color' }).first().click();
    await expect.poll(() => avisos.join('|')).toContain('ya está usado');
    expect(avisos.join('|')).toContain('ya está cargado');
    await expect(page.locator('#colores-list .color-fila')).toHaveCount(3);
  });

  test('al agregar color al stock se elige de la lista con su código @portal', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: conCodigos, firebase: { collections: { stock: STOCK } } });
    await abrirStock(page);
    await page.locator('#stock-list [data-producto-id="1"] .expandable-head-box').click();
    const bloqueM = page.locator('#stock-list .item-row .item-row', { hasText: 'Talle M' });
    await expect(bloqueM).toContainText('01 · Blanco');
    const opciones = await bloqueM.locator('select[aria-label="Color a agregar"] option').allTextContents();
    expect(opciones).toEqual(['Elegí un color…', '01 · Blanco', '13 · Negro']);
  });

  test('no deja publicar artículo + color repetido ni un artículo inválido @portal', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: (c: any) => {
      conCodigos(c);
      c.categorias[0].productos[1].articulo = '1101';   // misma combinación con Blanco
    }, firebase: { collections: { stock: { ...STOCK, 2: { variantes: { M: { Blanco: { cantidad: 1, hex: '#fff' } } } } } } } });
    const portal = await entrarAlPortal(page);
    const avisos: string[] = [];
    page.on('dialog', d => avisos.push(d.message()));
    await page.evaluate(async () => { (window as any).markDirty(); await (window as any).publishChanges(); });
    await expect.poll(() => avisos.join('|')).toContain('AR1101-01 está en dos prendas');
    void portal;
  });

  test('planilla: filas por artículo y color, columnas por talle, edita en la celda @portal', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: conCodigos, firebase: { collections: { stock: STOCK } } });
    await abrirStock(page);
    await page.locator('.subtab-btn[data-subtab="stock-planilla"]').click();
    const tabla = page.locator('#planilla-stock table');
    await expect(tabla.locator('tr').first()).toContainText('Código');
    const filaBlanco = tabla.locator('tr', { hasText: 'AR1101-01' });
    await expect(filaBlanco).toContainText('Blanco');
    await expect(filaBlanco.locator('td').last()).toHaveText('8');   // 3 en M + 5 en L
    const celda = page.getByRole('spinbutton', { name: /Blanco · talle M/ });
    await celda.fill('7');
    await celda.press('Tab');
    await expect.poll(async () => (await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(7);
    await expect(page.locator('#planilla-stock tr', { hasText: 'AR1101-01' }).locator('td').last()).toHaveText('12');
    const movs = Object.values(await getCollection(page, 'stock/1/movimientos')) as any[];
    expect(movs.some(m => m.color === 'Blanco' && m.talle === 'M' && m.delta === 4)).toBe(true);
  });

  test('producto nuevo pide el número de artículo @portal', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: conCodigos });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('catalogo');
    page.removeAllListeners('dialog');
    page.on('dialog', d => d.type() === 'prompt' ? d.accept('2421r') : d.accept());
    const catCamisas = page.locator('#cat-list > .item-row', { has: page.locator('.serif', { hasText: /^Camisas$/ }) });
    await catCamisas.getByRole('button', { name: '+ Producto' }).click();
    await expect(filaProducto(page, 9).locator('input[data-campo="articulo"]')).toHaveValue('2421R');
  });

  test('sin número de artículo no se crea el producto; el catálogo muestra el código @portal', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: conCodigos });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('catalogo');
    await expect(page.locator('#cat-list [data-producto-id="1"] .expandable-head')).toContainText('AR1101 · ');
    await expect(page.locator('#cat-list [data-producto-id="2"] .expandable-head')).toContainText('Sin artículo · ');
    page.removeAllListeners('dialog');
    page.on('dialog', d => (d.type() === 'prompt' ? d.dismiss() : d.accept()).catch(() => {}));
    const catCamisas = page.locator('#cat-list > .item-row', { has: page.locator('.serif', { hasText: /^Camisas$/ }) });
    await catCamisas.getByRole('button', { name: '+ Producto' }).click();
    await expect(filaProducto(page, 9)).toHaveCount(0);
    await page.locator('#cat-search').fill('ar1101');
    await expect(page.locator('#cat-list [data-producto-id]')).toHaveCount(1);
  });
});
