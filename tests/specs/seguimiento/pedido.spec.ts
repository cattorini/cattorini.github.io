import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { SeguimientoPage } from '../../pages/seguimiento.page';
import { pedidoPendienteSample, pedidoConEstado } from '../../fixtures/test-data';

/* Modelo nuevo: el doc ID ES el código (10 caracteres, crypto). */
const COD = 'K7M2Q9X4PZ';
const conCodigo = (p: any, codigo: string) => ({ [codigo]: { ...p, codigo } });

test.describe('Seguimiento de pedido @seguimiento @pedido', () => {

  test('sin código muestra buscador y lista de mis pedidos si hay @seguimiento', async ({ page }) => {
    await setupPage(page, {
      misPedidos: [
        { code: 'ABCDE23456', docId: 'ABCDE23456', ts: Date.now() - 60000 },
        { code: 'XYZW987654', docId: 'XYZW987654', ts: Date.now() - 3600000 }
      ]
    });
    const seg = new SeguimientoPage(page);
    await seg.goto();
    await expect(seg.searchCard).toBeVisible();
    await expect(seg.misPedidosCard).toBeVisible();
    await expect(seg.misPedidosLista.locator('.mp-item')).toHaveCount(2);
  });

  test('código inválido en URL muestra "no encontrado" @seguimiento', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { pedidos: {} } }
    });
    const seg = new SeguimientoPage(page);
    await seg.gotoConCodigo('NNNNNNNNNN');
    await expect(seg.notFoundCard).toBeVisible({ timeout: 5000 });
  });

  test('código válido muestra timeline + detalle @seguimiento @critical', async ({ page }) => {
    await setupPage(page, {
      firebase: {
        collections: {
          pedidos: conCodigo(pedidoPendienteSample, COD)
        }
      }
    });
    const seg = new SeguimientoPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.pedidoCard).toBeVisible({ timeout: 5000 });
    await expect(seg.codeDisplay).toContainText(COD);
    await expect(seg.steps).toHaveCount(4);
    await expect(seg.detalleCliente).toContainText(pedidoPendienteSample.cliente.nombre);
    await expect(seg.detalleItems).toContainText('Camisa Oxford Blanca');
  });

  test('timeline con modalidad envío etiqueta como Enviado @seguimiento', async ({ page }) => {
    const pedido = pedidoConEstado('preparando');
    pedido.modalidad = 'envio';
    await setupPage(page, {
      firebase: { collections: { pedidos: conCodigo(pedido, COD) } }
    });
    const seg = new SeguimientoPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.pedidoCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#step-label-4')).toHaveText(/Enviado/);
  });

  test('timeline con modalidad retiro etiqueta como Retirado @seguimiento', async ({ page }) => {
    const pedido = pedidoConEstado('preparando');
    pedido.modalidad = 'retiro';
    await setupPage(page, {
      firebase: { collections: { pedidos: conCodigo(pedido, COD) } }
    });
    const seg = new SeguimientoPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.pedidoCard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#step-label-4')).toHaveText(/Retirado/);
    await expect(page.locator('#step-label-3')).toHaveText(/Listo para retirar/);
  });

  test('estado enviado con modalidad envío muestra mensaje de despacho @seguimiento', async ({ page }) => {
    const pedido = pedidoConEstado('enviado');
    pedido.modalidad = 'envio';
    await setupPage(page, {
      firebase: { collections: { pedidos: conCodigo(pedido, COD) } }
    });
    const seg = new SeguimientoPage(page);
    await seg.gotoConCodigo(COD);
    await expect(seg.statusMsg).toContainText(/Vía Cargo/);
  });
});
