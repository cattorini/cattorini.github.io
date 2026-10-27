/**
 * SEGURIDAD / INTEGRIDAD del checkout (FALLAN HOY).
 *
 * Hoy (tienda.html ~1826-1862 y producto.html ~1691-1727):
 *  1) se descuenta el stock en una transacción y RECIÉN DESPUÉS se crea el
 *     pedido con add(); si el add falla, el stock queda descontado sin pedido
 *     (stock "perdido" que nadie vendió).
 *  2) el pedido usa add() → ID aleatorio, y el código es de 5 caracteres con
 *     Math.random (32^5 ≈ 33M, enumerable una vez que se cierre el list).
 *  3) doble click en "Confirmar pedido" crea dos pedidos y descuenta dos veces.
 *
 * Objetivo: UNA escritura atómica (transacción) que crea pedidos/{codigo} +
 * descuenta stock + registra movimientos; código >= 10 caracteres con
 * crypto.getRandomValues; botón bloqueado mientras se envía.
 */
import { test, expect, Page } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';

const STOCK = { '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' } } } } };
const CART = [{ key: '1__M__Blanco', id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', color: 'Blanco', qty: 1, precio: 22000 }];
const BASE = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' as const };

async function prepararCheckout(page: Page, url: string) {
  const tienda = new TiendaPage(page);
  await page.goto(url);
  await tienda.abrirCarrito();
  await tienda.elegirRetiro();
  await tienda.llenarDatosMinorista({ nombre: 'Cliente Integridad' });
  return tienda;
}

for (const pagina of ['/tienda.html', '/producto.html?id=1']) {
  test.describe(`Checkout atómico en ${pagina} @seguridad @checkout`, () => {

    test('si falla la creación del pedido, el stock NO queda descontado @seguridad', async ({ page }) => {
      await setupPage(page, { ...BASE, cart: CART, firebase: { collections: { stock: STOCK }, denyWritesTo: ['pedidos'] } });
      const tienda = await prepararCheckout(page, pagina);
      await tienda.confirmarPedido();
      await page.waitForTimeout(800);
      expect(Object.keys(await getCollection(page, 'pedidos'))).toHaveLength(0);
      expect((await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad,
        'stock descontado sin pedido').toBe(3);
    });

    test('el pedido se guarda con ID = código, código >= 10 caracteres [A-Z0-9] @seguridad', async ({ page }) => {
      await setupPage(page, { ...BASE, cart: CART, firebase: { collections: { stock: STOCK } } });
      const tienda = await prepararCheckout(page, pagina);
      await tienda.confirmarPedido();
      await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });
      const codigo = ((await page.locator('#confirm-code').textContent()) || '').replace('#', '').trim();
      expect(codigo).toMatch(/^[A-Z0-9]{10,20}$/);
      const pedidos = await getCollection(page, 'pedidos');
      expect(Object.keys(pedidos)).toEqual([codigo]);
    });

    test('el movimiento de venta se escribe en la MISMA transacción que pedido y stock @seguridad', async ({ page }) => {
      await setupPage(page, { ...BASE, cart: CART, firebase: { collections: { stock: STOCK } } });
      const tienda = await prepararCheckout(page, pagina);
      await tienda.confirmarPedido();
      await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });
      const log = await page.evaluate(() => (window as any).__firebaseMock.log);
      const commits = log.filter((e: any) => e.op === 'tx-commit');
      const commitConPedido = commits.find((c: any) => c.paths.some((p: string) => p.startsWith('set:pedidos/')));
      expect(commitConPedido, 'el pedido no se crea dentro de la transacción').toBeTruthy();
      expect(commitConPedido.paths.some((p: string) => p.startsWith('update:stock/1') || p.startsWith('set:stock/1'))).toBe(true);
      expect(commitConPedido.paths.some((p: string) => /stock\/1\/movimientos\//.test(p))).toBe(true);
    });

    test('doble click en "Confirmar pedido" crea UN solo pedido y descuenta una vez @seguridad', async ({ page }) => {
      await setupPage(page, { ...BASE, cart: CART, firebase: { collections: { stock: STOCK }, latency: 300 } });
      await prepararCheckout(page, pagina);
      await page.evaluate(() => { (window as any).sendOrder(); (window as any).sendOrder(); });
      await page.waitForTimeout(2500);
      expect(Object.keys(await getCollection(page, 'pedidos'))).toHaveLength(1);
      expect((await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(2);
    });
  });
}
