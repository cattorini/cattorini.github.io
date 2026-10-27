/**
 * Pedido mayorista grande (muchas combinaciones talle/color de UNA prenda).
 *
 * El checkout online descuenta stock en una transacción que las reglas
 * validan variante por variante; Firestore corta en 1000 expresiones por
 * documento, así que el tope es 12 combinaciones por producto por pedido
 * (CattCore.MAX_VARIANTES_POR_PRODUCTO, TEMPORAL hasta el Worker de pagos).
 * Más que eso: no se envía online, se ofrece WhatsApp con el pedido completo.
 * (El mismo flujo contra el emulador con las reglas reales está en
 *  emulador/checkout.test.mjs.)
 */
import { test, expect, Page } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';
import { mayoristaSample, CODIGO_MAYO_INDIVIDUAL_HASH } from '../../fixtures/test-data';

const TALLES = ['38', '40', '42', '44', '46', '48', '50', '52', '54'];
const COLORES = { Blanco: '#ffffff', Celeste: '#a0c4ff' };

function stock() {
  const v: any = {};
  for (const t of TALLES) { v[t] = {}; for (const [c, hex] of Object.entries(COLORES)) v[t][c] = { cantidad: 10, hex }; }
  return { '1': { variantes: v } };
}
function cart(n: number) {
  const out: any[] = [];
  for (const t of TALLES) for (const c of Object.keys(COLORES)) {
    if (out.length < n) out.push({ key: `1__${t}__${c}`, id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: t, color: c, qty: 2, precio: 14500 });
  }
  return out;
}
async function prepararMayorista(page: Page, n: number) {
  await setupPage(page, {
    perfil: 'mayorista', codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: mayoristaSample,
    cart: cart(n),
    firebase: { collections: { stock: stock(), mayoristas_activos: { [CODIGO_MAYO_INDIVIDUAL_HASH]: mayoristaSample } } }
  });
}

for (const pagina of ['/tienda.html', '/producto.html?id=1']) {
  test.describe(`Pedido mayorista grande en ${pagina} @tienda @checkout @mayorista`, () => {

    test('9 talles × 2 colores (18 combinaciones): no se envía online y ofrece WhatsApp con el pedido completo @checkout', async ({ page }) => {
      await prepararMayorista(page, 18);
      const tienda = new TiendaPage(page);
      await page.goto(pagina);
      await tienda.abrirCarrito();
      await tienda.elegirRetiro();
      await tienda.confirmarPedido();

      const modal = page.locator('#wa-pedido-modal [role="dialog"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText(/más de 12 combinaciones/i);
      await expect(modal).toContainText(/WhatsApp/);
      const href = (await page.locator('#wa-pedido-btn').getAttribute('href')) || '';
      expect(href).toMatch(/^https:\/\/wa\.me\/5492244429515\?text=/);
      const texto = decodeURIComponent(href.split('?text=')[1]);
      expect((texto.match(/^• /gm) || []).length).toBe(18);
      expect(texto).toContain('Talle 54 · Celeste · x2');
      expect(texto).toContain(mayoristaSample.nombre);

      expect(Object.keys(await getCollection(page, 'pedidos'))).toHaveLength(0);
      expect((await getCollection(page, 'stock'))['1'].variantes['38'].Blanco.cantidad).toBe(10);
      /* el carrito no se pierde */
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('catt_cart_v2') || '[]').length)).toBe(18);
    });

    test('12 combinaciones: el pedido se crea con todo el descuento en una transacción @checkout', async ({ page }) => {
      await prepararMayorista(page, 12);
      const tienda = new TiendaPage(page);
      await page.goto(pagina);
      await tienda.abrirCarrito();
      await tienda.elegirRetiro();
      await tienda.confirmarPedido();
      await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });
      const codigo = ((await page.locator('#confirm-code').textContent()) || '').replace('#', '').trim();
      const pedidos = await getCollection(page, 'pedidos');
      expect(Object.keys(pedidos)).toEqual([codigo]);
      expect(pedidos[codigo].items).toHaveLength(12);
      const st = (await getCollection(page, 'stock'))['1'];
      expect(st.variantes['38'].Blanco.cantidad).toBe(8);
      expect(st.variantes['48'].Celeste.cantidad).toBe(8);
      expect(st.variantes['50'].Blanco.cantidad).toBe(10);
      expect(st.descuento).toHaveLength(12);
      expect(st.ultimoPedido).toBe(codigo);
      expect(Object.keys(await getCollection(page, 'stock/1/movimientos'))).toHaveLength(12);
    });
  });
}
