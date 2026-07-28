import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { LandingPage } from '../../pages/landing.page';
import { TiendaPage } from '../../pages/tienda.page';
import { ProductoPage } from '../../pages/producto.page';
import { PortalPage } from '../../pages/portal.page';
import { SeguimientoPage } from '../../pages/seguimiento.page';
import { CODIGO_MASTER, pedidoPendienteSample } from '../../fixtures/test-data';

test.describe('Smoke tests @smoke @critical', () => {

  test('landing carga con todos los elementos principales @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.heroTitle).toBeVisible();
    await expect(landing.ctaMayorista).toBeVisible();
    await expect(landing.ctaConsultarSolicitud).toBeVisible();
    // categorías y destacados se llenan asincrónicamente
    await expect(landing.categoriasGrid.locator('.cat-card').first()).toBeVisible({ timeout: 5000 });
    await expect(landing.destacadosGrid.locator('.pcard').first()).toBeVisible({ timeout: 5000 });
  });

  test('tienda muestra gate de identificación en primera visita @tienda', async ({ page }) => {
    await setupPage(page);
    const tienda = new TiendaPage(page);
    await tienda.goto();

    await expect(tienda.modalWelcome).toBeVisible();
    await expect(tienda.btnSoyMayorista).toBeVisible();
    await expect(tienda.btnSoyMinorista).toBeVisible();
  });

  test('minorista en zona libre accede al catálogo @tienda @minorista', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Bahía Blanca',
      zonaStatus: 'libre'
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();

    await expect(tienda.modalWelcome).toBeHidden();
    await expect(tienda.catalog).toBeVisible();
    await expect(tienda.perfilBadge).toContainText(/minorista/i);
  });

  test('mayorista con código master accede al catálogo @tienda @mayorista', async ({ page }) => {
    await setupPage(page);
    const tienda = new TiendaPage(page);
    await tienda.goto();

    await tienda.elegirMayorista();
    await tienda.ingresarCodigoMayorista(CODIGO_MASTER);

    await expect(tienda.modalWelcome).toBeHidden();
    await expect(tienda.catalog).toBeVisible();
    await expect(tienda.perfilBadge).toContainText(/mayorista/i);
  });

  test('producto detalle carga y permite agregar al carrito @producto', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Bahía Blanca',
      zonaStatus: 'libre'
    });
    const producto = new ProductoPage(page);
    await producto.goto(1);
    await producto.esperarCarga();

    await expect(producto.nombre).toContainText(/Camisa/i);
    await expect(producto.addCartBtn).toBeDisabled();

    await producto.elegirTalle('M');
    await expect(producto.addCartBtn).toBeEnabled();

    await producto.agregarAlCarrito();
    await expect(producto.cartCount).toHaveText('1');
  });

  test('carrito con items abre drawer con contenido @carrito', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Bahía Blanca',
      zonaStatus: 'libre',
      cart: [{ id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 1, precio: 22000 }]
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();

    await expect(tienda.drawer).toBeVisible();
    await expect(tienda.drawerFooter).toBeVisible();
    await expect(tienda.drawerBody).toContainText('Camisa Oxford Blanca');
  });

  test('portal muestra setup inicial cuando no hay PAT guardado @portal', async ({ page }) => {
    await setupPage(page);
    const portal = new PortalPage(page);
    await portal.goto();

    await expect(portal.loginFirst).toBeVisible();
    await expect(portal.inPat).toBeVisible();
    await expect(portal.inPass).toBeVisible();
  });

  test('seguimiento con código válido muestra timeline @seguimiento', async ({ page }) => {
    await setupPage(page, {
      firebase: {
        collections: {
          pedidos: { 'test-doc-1': pedidoPendienteSample }
        }
      }
    });
    const seg = new SeguimientoPage(page);
    await seg.gotoConCodigo(pedidoPendienteSample.codigo);

    await expect(seg.pedidoCard).toBeVisible({ timeout: 5000 });
    await expect(seg.codeDisplay).toContainText(pedidoPendienteSample.codigo);
    await expect(seg.steps.first()).toBeVisible();
  });
});
