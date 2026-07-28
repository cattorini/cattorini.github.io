import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { PedidosPage } from '../../pages/pedidos.page';
import { pedidoConEstado } from '../../fixtures/test-data';

test.describe('Pedidos — kanban @pedidos', () => {

  test('4 columnas visibles con conteos @pedidos', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: {
        collections: {
          pedidos: {
            d1: pedidoConEstado('pendiente'),
            d2: pedidoConEstado('preparando'),
            d3: pedidoConEstado('listo'),
            d4: pedidoConEstado('enviado')
          }
        }
      }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await expect(p.appScreen).toBeVisible({ timeout: 5000 });
    await expect(p.cPend).toHaveText('1');
    await expect(p.cPrep).toHaveText('1');
    await expect(p.cListo).toHaveText('1');
    await expect(p.cEnviado).toHaveText('1');
  });

  test('pedido nuevo aparece en columna Pendientes @pedidos', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: { collections: { pedidos: {} } }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await expect(p.appScreen).toBeVisible({ timeout: 5000 });
    await expect(p.cPend).toHaveText('0');

    // Simular llegada de un nuevo pedido
    await page.evaluate(() => {
      (window as any).__firebaseMock.setDoc('pedidos', 'nuevo', {
        codigo: 'NEWABC', creadoEn: { toDate: () => new Date() },
        cliente: { nombre: 'Nuevo Cliente', perfil: 'minorista' },
        items: [], modalidad: 'retiro', subtotal: 0, envio: 0, total: 0,
        nota: '', estado: 'pendiente'
      });
    });
    await expect(p.cPend).toHaveText('1', { timeout: 3000 });
  });

  test('filtros mayorista/minorista funcionan @pedidos', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: {
        collections: {
          pedidos: {
            d1: { ...pedidoConEstado('pendiente'), cliente: { nombre: 'A', perfil: 'mayorista' } },
            d2: { ...pedidoConEstado('pendiente'), cliente: { nombre: 'B', perfil: 'minorista' } }
          }
        }
      }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await expect(p.cPend).toHaveText('2');
    await p.filterPill('mayorista').click();
    await expect(p.cPend).toHaveText('1');
    await p.filterPill('minorista').click();
    await expect(p.cPend).toHaveText('1');
    await p.filterPill('todos').click();
    await expect(p.cPend).toHaveText('2');
  });

  test('click en tarjeta abre modal detalle @pedidos', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: { collections: { pedidos: { d1: pedidoConEstado('pendiente') } } }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await p.bodyPend.locator('.card').first().click();
    await expect(p.modalDetail).toHaveClass(/open/);
  });
});
