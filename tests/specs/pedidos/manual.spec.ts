import { test, expect } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { PedidosPage } from '../../pages/pedidos.page';
import { mayoristaSample, CODIGO_MAYO_INDIVIDUAL_HASH } from '../../fixtures/test-data';

test.describe('Pedido manual @pedidos @manual', () => {

  test('modal abre con perfil minorista por default @pedidos', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: { collections: { pedidos: {}, mayoristas_activos: {} } }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await page.locator('button', { hasText: '+ Manual' }).click();
    await expect(p.modalManual).toHaveClass(/open/);
    await expect(p.mPerfilMino).toHaveClass(/active/);
    await expect(p.mDatosMino).toBeVisible();
    await expect(p.mDatosMayo).toBeHidden();
  });

  test('cambiar a mayorista carga el dropdown de mayoristas @pedidos @mayorista', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: {
        collections: {
          pedidos: {},
          mayoristas_activos: { [CODIGO_MAYO_INDIVIDUAL_HASH]: mayoristaSample }
        }
      }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await page.locator('button', { hasText: '+ Manual' }).click();
    await p.mPerfilMayo.click();
    await expect(p.mDatosMayo).toBeVisible();
    /* esperar a que se carguen los mayoristas del mock */
    await page.waitForTimeout(500);
    const options = await p.mMayoristaSel.locator('option').allTextContents();
    expect(options.some(o => o.includes(mayoristaSample.nombre))).toBe(true);
  });

  test('seleccionar mayorista autocompleta info y datos de envío @pedidos @mayorista', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: {
        collections: {
          pedidos: {},
          mayoristas_activos: { 'h1': mayoristaSample }
        }
      }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await page.locator('button', { hasText: '+ Manual' }).click();
    await p.mPerfilMayo.click();
    await page.waitForTimeout(500);
    await p.mMayoristaSel.selectOption({ value: 'h1' });
    await expect(p.mMayoristaInfo).toContainText(mayoristaSample.nombre);
    await expect(p.mMayoristaInfo).toContainText(mayoristaSample.negocio);
    // Los campos de envío se autocompletan
    await expect(p.mDir).toHaveValue(mayoristaSample.direccion);
    await expect(p.mLoc).toHaveValue(mayoristaSample.localidad);
  });

  test('minorista sin nombre no permite crear pedido @pedidos', async ({ page }) => {
    await setupPage(page, {
      portalSession: true,
      firebase: { collections: { pedidos: {}, mayoristas_activos: {} } }
    });
    const p = new PedidosPage(page);
    await p.goto();
    await page.locator('button', { hasText: '+ Manual' }).click();
    page.on('dialog', d => d.accept());
    await p.mSubmitBtn.click();
    const pedidos = await getCollection(page, 'pedidos');
    expect(Object.keys(pedidos).length).toBe(0);
  });
});
