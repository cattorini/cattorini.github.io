/**
 * Cola de pedidos — sesión de staff, cancelación con devolución de stock,
 * CSV sin fórmulas, aviso de precio y pedido manual atómico.
 * Todo contra el mock de Firebase (nunca el proyecto real).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { setupPage, getCollection, getFirebaseLog } from '../../helpers/setup';
import { entrarAPedidos, loginStaff } from '../../helpers/portal';
import { PedidosPage } from '../../pages/pedidos.page';
import { STAFF_EMAIL, pedidoPendienteSample } from '../../fixtures/test-data';

const COD = 'PEDK7M2Q9X';

function pedidoConStock(extra: Record<string, any> = {}) {
  return {
    ...pedidoPendienteSample,
    codigo: COD,
    items: [
      { id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', color: 'Blanco', qty: 2, precio: 22000 },
      { id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'L', color: 'Blanco', qty: 1, precio: 22000 }
    ],
    subtotal: 66000, envio: 0, total: 66000, modalidad: 'retiro',
    ...extra
  };
}

test.describe('Pedidos — sesión de staff @pedidos @seguridad', () => {

  test('contraseña incorrecta: mensaje en español y no se lee ningún pedido @pedidos @seguridad', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { pedidos: { [COD]: pedidoConStock() } } } });
    await page.goto('/pedidos.html');
    await loginStaff(page, STAFF_EMAIL, 'mala');
    await expect(page.locator('#err-auth')).toHaveText('Email o contraseña incorrectos.');
    await expect(page.locator('#app-screen')).toBeHidden();
    const log = await getFirebaseLog(page);
    expect(log.filter(e => (e.op === 'list' || e.op === 'listen-list') && e.path === 'pedidos')).toEqual([]);
  });

  test('cuenta sin permiso (permission-denied) → se cierra la sesión con mensaje claro @pedidos @seguridad', async ({ page }) => {
    await setupPage(page, { firebase: { failReadsFrom: ['pedidos'], collections: { pedidos: { [COD]: pedidoConStock() } } } });
    await page.goto('/pedidos.html');
    await loginStaff(page);
    await expect(page.locator('#err-auth')).toContainText('no tiene permiso');
    await expect(page.locator('#app-screen')).toBeHidden();
    await expect(page.locator('body')).not.toContainText(pedidoPendienteSample.cliente.nombre);
    const log = await getFirebaseLog(page);
    expect(log.some(e => e.op === 'auth-signout')).toBe(true);
    expect(log.filter(e => e.op === 'listen-list')).toEqual([]);
  });

  test('"Cerrar sesión" vuelve al login y deja de mostrar pedidos @pedidos', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { pedidos: { [COD]: pedidoConStock() } } } });
    await entrarAPedidos(page);
    await expect(page.locator('#body-pend')).toContainText(pedidoPendienteSample.cliente.nombre);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('#app-screen')).toBeHidden();
  });
});

test.describe('Pedidos — cancelar devuelve stock @pedidos @regresion', () => {

  test('cancelar: devuelve stock y registra movimientos positivos en UNA transacción @pedidos', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: {
        pedidos: { [COD]: pedidoConStock() },
        stock: { '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' } }, L: { Blanco: { cantidad: 0, hex: '#ffffff' } } } } }
      } }
    });
    const p = new PedidosPage(page);
    await entrarAPedidos(page);
    await p.bodyPend.locator('.card').first().click();
    await page.getByRole('button', { name: /Cancelar pedido/ }).click();
    await expect.poll(async () => (await getCollection(page, 'pedidos'))[COD].estado).toBe('cancelado');
    const stock = (await getCollection(page, 'stock'))['1'].variantes;
    expect(stock.M.Blanco.cantidad).toBe(5);
    expect(stock.L.Blanco.cantidad).toBe(1);
    const movs = Object.values(await getCollection(page, 'stock/1/movimientos')) as any[];
    expect(movs).toHaveLength(2);
    for (const m of movs) expect(m.motivo).toBe('Cancelación #' + COD);
    expect(movs.map(m => m.delta).sort()).toEqual([1, 2]);
    const log = await getFirebaseLog(page);
    const commit = log.find(e => e.op === 'tx-commit' && e.paths.includes('update:pedidos/' + COD));
    expect(commit.paths).toEqual(expect.arrayContaining(['set:stock/1', 'update:pedidos/' + COD]));
    /* sale de la cola activa */
    await expect(p.cPend).toHaveText('0');
  });

  test('un pedido ya cancelado no se puede volver a cancelar (no devuelve stock dos veces) @pedidos', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: {
        pedidos: { [COD]: pedidoConStock({ estado: 'cancelado', stockDevuelto: true }) },
        stock: { '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' } } } } }
      } }
    });
    await entrarAPedidos(page);
    await page.locator('.tab-btn[data-tab="historial"]').click();
    await page.locator('#hist-body tr').first().click();
    await expect(page.locator('#detail-content')).toContainText('Pedido cancelado');
    await expect(page.getByRole('button', { name: /Cancelar pedido/ })).toHaveCount(0);
    expect((await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(3);
  });
});

test.describe('Pedidos — CSV y avisos @pedidos @seguridad', () => {

  test('CSV: celdas que empiezan con = + - @ quedan como texto (sin fórmulas) @pedidos @seguridad', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { pedidos: { [COD]: pedidoConStock({
        cliente: { ...pedidoPendienteSample.cliente, nombre: '=HYPERLINK("http://x","clic")', direccion: '+cmd|calc', localidad: '@SUM(1)' },
        nota: '-2+3'
      }) } } }
    });
    await entrarAPedidos(page);
    await page.locator('.tab-btn[data-tab="historial"]').click();
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Exportar CSV/ }).click()
    ]);
    const csv = readFileSync(await descarga.path() as string, 'utf8');
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(csv).toContain(`"'+cmd|calc"`);
    expect(csv).toContain(`"'@SUM(1)"`);
    expect(csv).toContain(`"'-2+3"`);
    expect(csv).not.toMatch(/(^|;)"[=+@]/m);
  });

  test('aviso en la tarjeta si el precio de un item no coincide con el catálogo actual @pedidos @seguridad', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { pedidos: {
        BIEN000001: pedidoConStock({ codigo: 'BIEN000001' }),
        MAL0000001: pedidoConStock({ codigo: 'MAL0000001', cliente: { ...pedidoPendienteSample.cliente, nombre: 'Precio Trucho' },
          items: [{ id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', color: 'Blanco', qty: 1, precio: 1 }],
          subtotal: 1, total: 1 })
      } } }
    });
    const p = new PedidosPage(page);
    await entrarAPedidos(page);
    await expect(p.bodyPend.locator('.card')).toHaveCount(2);
    await expect(p.bodyPend.locator('.card', { hasText: 'Precio Trucho' }).locator('.card-aviso')).toContainText('Precio distinto');
    await expect(p.bodyPend.locator('.card', { hasText: 'BIEN000001' }).locator('.card-aviso')).toHaveCount(0);
    await p.bodyPend.locator('.card', { hasText: 'Precio Trucho' }).click();
    await expect(page.locator('#detail-content .item-aviso')).toContainText('22.000');
  });
});

test.describe('Pedidos — pedido manual @pedidos @manual @regresion', () => {

  test('pedido manual: código de 10 caracteres = ID del doc, stock y movimientos en UNA transacción @pedidos', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: {
        pedidos: {}, mayoristas_activos: {},
        stock: { '1': { variantes: { S: { Blanco: { cantidad: 4, hex: '#ffffff' } } } } }
      } }
    });
    const p = new PedidosPage(page);
    await entrarAPedidos(page);
    await page.locator('button', { hasText: '+ Manual' }).click();
    await p.mNombre.fill('Cliente Mostrador');
    await p.mProducto.selectOption({ value: 'camisas__1' });
    await expect(page.locator('#m-color option')).toHaveCount(1);
    await p.mQty.fill('3');
    await p.mAgregarBtn.click();
    await p.mSubmitBtn.click();
    await expect(p.modalManual).not.toHaveClass(/open/);
    const pedidos = await getCollection(page, 'pedidos');
    const ids = Object.keys(pedidos);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    expect(pedidos[ids[0]]).toMatchObject({ codigo: ids[0], manual: true, estado: 'pendiente' });
    expect((await getCollection(page, 'stock'))['1'].variantes.S.Blanco.cantidad).toBe(1);
    const movs = Object.values(await getCollection(page, 'stock/1/movimientos')) as any[];
    expect(movs).toEqual([expect.objectContaining({ delta: -3, cantidadResultante: 1, motivo: 'Venta manual #' + ids[0] })]);
    const log = await getFirebaseLog(page);
    const commit = log.find(e => e.op === 'tx-commit' && e.paths.includes('set:pedidos/' + ids[0]));
    expect(commit.paths).toEqual(expect.arrayContaining(['set:stock/1']));
  });
});
