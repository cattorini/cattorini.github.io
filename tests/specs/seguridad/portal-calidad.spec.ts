/**
 * CALIDAD / DATOS del portal (FALLAN HOY).
 *
 * En producción hay un producto disponible a $0 (id 12 "Camisa Lawrence.")
 * y otro con precio mayorista 30.9 (id 1, probablemente 30900). El portal
 * deja publicar ambos sin avisar. Un producto nuevo nace "disponible" con
 * precio 0 → si se publica antes de cargar el precio, se vende gratis.
 */
import { test, expect } from '@playwright/test';
import { setupPage, getGithubPuts } from '../../helpers/setup';
import { entrarAlPortal } from '../../helpers/portal';

test.describe('Portal — validaciones antes de publicar @seguridad @portal', () => {

  test('no deja publicar un producto disponible con precio minorista 0 @seguridad', async ({ page }) => {
    await setupPage(page, {
      mutarCatalogo: (json) => {
        json.categorias[0].productos.push({
          id: 20, nombre: 'Producto a $0', descripcion: '', precio_minorista: 0, precio_mayorista: 0,
          talles_disponibles: [], disponible: true, destacado: false, imagenes: [], fabricacion_propia: true, tipo_talle: ''
        });
      }
    });
    const portal = await entrarAlPortal(page, { rechazarConfirms: true });
    /* cualquier cambio para habilitar "Publicar" */
    /* un cambio real cualquiera (si no, publishChanges dice "sin cambios") */
    await page.evaluate('data.textos.footer.texto += " (test)"; markDirty();');
    await portal.publishBtn.click();
    await page.waitForTimeout(1000);
    expect(getGithubPuts(page).filter(p => p.path === 'productos.json'),
      'publicó un producto disponible a $0').toHaveLength(0);
  });

  test('avisa/bloquea precio mayorista absurdamente bajo (< 10% del minorista) @seguridad', async ({ page }) => {
    await setupPage(page, {
      mutarCatalogo: (json) => { json.categorias[0].productos[0].precio_mayorista = 30.9; }
    });
    /* Vale bloquear o pedir confirmación: si el admin NO confirma, no se publica */
    const portal = await entrarAlPortal(page, { rechazarConfirms: true });
    /* un cambio real cualquiera (si no, publishChanges dice "sin cambios") */
    await page.evaluate('data.textos.footer.texto += " (test)"; markDirty();');
    await portal.publishBtn.click();
    await page.waitForTimeout(1000);
    expect(getGithubPuts(page).filter(p => p.path === 'productos.json')).toHaveLength(0);
  });
});
