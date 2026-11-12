import { test, Page } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { entrarAlPortal, loginStaff } from '../../helpers/portal';
import { PANTALLAS, expectEnPantalla } from '../../helpers/en-pantalla';
import { pedidoPendienteSample } from '../../fixtures/test-data';

/* Toda ventana emergente nueva se agrega acá (ver helpers/en-pantalla.ts). */

const minorista = { perfil: 'minorista' as const, provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre' };
const carrito = [{ id: 1, nombre: 'Camisa Oxford Blanca de nombre largo para probar', categoria: 'Camisas', talle: 'M', qty: 2, precio: 22000, recargoTalle: 0 }];
const conMp = (c: any) => { c.config.pago.mercadopago_activo = true; };

async function confirmacionConQr(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    document.getElementById('confirm-code')!.textContent = '#8NNV94MU92';
    document.getElementById('confirm-msg')!.textContent = 'Pagá con el QR y mandanos el comprobante: apenas lo recibamos, preparamos tu pedido.';
    document.getElementById('confirm-pago-qr')!.style.display = 'block';
    document.getElementById('confirm-pago-datos')!.style.display = 'block';
    document.getElementById('confirm-pago-titular')!.textContent = 'Original 59 S.A';
    document.getElementById('confirm-pago-banco')!.textContent = 'Banco Credicoop';
    const m = document.getElementById('confirm-modal')!;
    if (m.classList.contains('confirm-back')) m.classList.add('open'); else m.style.display = 'flex';
    void w;
  });
}
const zona = { mayorista: { nombre: 'Distribuidor de nombre bastante largo S.R.L.', telefono: '02244 44-4444', whatsapp: '5492244000000', direccion: 'Calle Falsa 123, Localidad Larga' } };

for (const pantalla of PANTALLAS) {
  test.describe(`Ventanas en pantalla — ${pantalla.nombre} ${pantalla.width}x${pantalla.height} @regresion`, () => {
    test.use({ viewport: { width: pantalla.width, height: pantalla.height } });

    test('tienda: bienvenida y sus pasos @regresion', async ({ page }) => {
      await setupPage(page);
      await page.goto('/tienda.html');
      const caja = page.locator('.modal-content');
      await expectEnPantalla(caja, 'bienvenida');
      for (const paso of ['mayorista', 'minorista']) {
        await page.evaluate((p) => (window as any).goToStep(p), paso);
        await expectEnPantalla(caja, 'paso ' + paso);
      }
    });

    test('tienda: confirmación con QR, zona bloqueada, pedido por WhatsApp y carrito @regresion', async ({ page }) => {
      await setupPage(page, { ...minorista, cart: carrito, mutarCatalogo: conMp });
      await page.goto('/tienda.html');
      await page.locator('.pcard').first().waitFor();
      await confirmacionConQr(page);
      await expectEnPantalla(page.locator('#confirm-modal [role="dialog"]'), 'confirmación', { sinScroll: true });
      await page.evaluate(() => (window as any).closeConfirm());

      await page.evaluate((z) => (window as any).mostrarZonaBloqueadaCheckout(z), zona);
      await expectEnPantalla(page.locator('#zona-block-modal [role="dialog"]'), 'zona bloqueada', { sinScroll: true });
      await page.evaluate(() => (window as any).cerrarZonaBlock());

      await page.evaluate(() => (window as any).CattCore.mostrarPedidoPorWhatsApp('5492244429515',
        'Tu pedido tiene 14 combinaciones de talle y color de "Camisa". Los pedidos de más de 12 combinaciones de una misma prenda los armamos por WhatsApp: te dejamos el pedido completo listo para enviar y lo cargamos nosotros.', 'x'));
      await expectEnPantalla(page.locator('#wa-pedido-modal [role="dialog"]'), 'pedido por WhatsApp', { sinScroll: true });
      await page.evaluate(() => document.getElementById('wa-pedido-modal')!.remove());

      await page.evaluate(() => (window as any).openCart());
      await page.locator('#tog-pago-mp').waitFor();
      /* el cajón entra deslizándose: medir cuando terminó de abrir */
      await page.waitForFunction(() => {
        const r = document.getElementById('drawer')!.getBoundingClientRect();
        return r.right <= window.innerWidth + 1;
      });
      await expectEnPantalla(page.locator('#drawer'), 'carrito');
      await expectEnPantalla(page.locator('#drawer-footer'), 'pie del carrito');
    });

    test('producto: confirmación, guía de talles, zona bloqueada y fantasía @regresion', async ({ page }) => {
      await setupPage(page, {
        ...minorista, cart: carrito, mutarCatalogo: (c: any) => {
          conMp(c);
          c.categorias[0].productos[0].fantasias = { 'Raya azul': { tipo: 'raya', foto: 'cat-camisas.jpg' } };
        },
        firebase: { collections: { stock: { 1: { variantes: { M: { 'Raya azul': { cantidad: 2, hex: '#000000' } } } } } } }
      });
      await page.goto('/producto.html?id=1');
      await page.locator('#p-name').filter({ hasText: /\w/ }).waitFor();
      await confirmacionConQr(page);
      await expectEnPantalla(page.locator('#confirm-modal [role="dialog"]'), 'confirmación', { sinScroll: true });
      await page.evaluate(() => (window as any).closeConfirm());

      await page.evaluate(() => (window as any).openGuia());
      await expectEnPantalla(page.locator('#modal-guia .modal-b'), 'guía de talles');
      await page.evaluate(() => (window as any).closeGuia());

      await page.evaluate((z) => (window as any).mostrarZonaBloqueadaCheckout(z), zona);
      await expectEnPantalla(page.locator('#zona-block-modal [role="dialog"]'), 'zona bloqueada', { sinScroll: true });
      await page.evaluate(() => (window as any).cerrarZonaBlock());

      await page.locator('.talle-btn', { hasText: 'M' }).first().click();
      await page.getByRole('button', { name: 'Ampliar Raya azul' }).click();
      await expectEnPantalla(page.locator('#modal-fantasia .fantasia-box'), 'fantasía', { sinScroll: true });
    });

    test('landing: solicitud mayorista @regresion', async ({ page }) => {
      await setupPage(page);
      await page.goto('/index.html');
      await page.evaluate(() => (window as any).openMayForm());
      await expectEnPantalla(page.locator('.may-content'), 'solicitud mayorista');
    });

    test('portal: código del mayorista recién aceptado @regresion', async ({ page }) => {
      await setupPage(page);
      await entrarAlPortal(page);
      await page.evaluate(() => (window as any).mostrarModalCodigo({
        titulo: 'Solicitud aceptada', nombre: 'Nombre Apellido — Negocio de nombre largo',
        codigo: 'CATT-ABCDEFGHJK', whatsapp: '5492244000000', mayoristaData: { nombre: 'N', negocio: 'X' }
      }));
      await expectEnPantalla(page.locator('#modal-codigo > div'), 'código mayorista', { sinScroll: true });
    });

    test('panel de pedidos: detalle y pedido manual @regresion', async ({ page }) => {
      await setupPage(page, { firebase: { collections: { pedidos: { K7M2Q9X4PZ: { ...pedidoPendienteSample, codigo: 'K7M2Q9X4PZ' } } } } });
      await page.goto('/pedidos.html');
      await loginStaff(page);
      await page.waitForFunction(() => (window as any).showDetail);
      await page.evaluate((o) => (window as any).showDetail(o), { id: 'K7M2Q9X4PZ', ...pedidoPendienteSample, codigo: 'K7M2Q9X4PZ', creadoEn: null });
      await expectEnPantalla(page.locator('#modal-detail .modal'), 'detalle del pedido');
      await page.evaluate(() => (window as any).closeDetail && (window as any).closeDetail());
      await page.evaluate(() => (window as any).openManual());
      await expectEnPantalla(page.locator('#modal-manual .modal'), 'pedido manual');
    });
  });
}
