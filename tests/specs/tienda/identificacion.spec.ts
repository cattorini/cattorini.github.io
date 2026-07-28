import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';
import { CODIGO_MASTER } from '../../fixtures/test-data';

test.describe('Tienda — identificación @tienda @ident', () => {

  test('gate aparece en primera visita @tienda', async ({ page }) => {
    await setupPage(page);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await expect(tienda.modalWelcome).toBeVisible();
    await expect(tienda.btnSoyMayorista).toBeVisible();
    await expect(tienda.btnSoyMinorista).toBeVisible();
  });

  test('mayorista con código master válido accede al catálogo @mayorista', async ({ page }) => {
    await setupPage(page);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.elegirMayorista();
    await tienda.ingresarCodigoMayorista(CODIGO_MASTER);
    await expect(tienda.modalWelcome).toBeHidden();
    await expect(tienda.catalog).toBeVisible();
    await expect(tienda.perfilBadge).toContainText(/mayorista/i);
  });

  test('mayorista con código individual valida contra mayoristas_activos @mayorista', async ({ page }) => {
    // Pre-configurar un mayorista en la colección + su hash
    const codigo = 'CATT-CUSTOM1';
    // sha256(codigo) — como necesitamos el hash calculado, lo hacemos en el browser
    await setupPage(page, {
      firebase: { collections: { mayoristas_activos: {} } }
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();

    // Calcular hash y setear el mayorista en el mock
    const hash = await page.evaluate(async (cod) => {
      const buf = new TextEncoder().encode(cod);
      const h = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
    }, codigo);

    await page.evaluate(({ h, data }) => {
      (window as any).__firebaseMock.setDoc('mayoristas_activos', h, data);
    }, {
      h: hash,
      data: {
        nombre: 'Juan Test',
        negocio: 'Test SRL',
        whatsapp: '5491100000000',
        direccion: 'Calle 1',
        provincia: 'Buenos Aires',
        localidad: 'La Plata'
      }
    });

    await tienda.elegirMayorista();
    await tienda.ingresarCodigoMayorista(codigo);

    await expect(tienda.modalWelcome).toBeHidden();
    await expect(tienda.catalog).toBeVisible();

    // Verificar que se guardaron datos del mayorista en localStorage
    const data = await page.evaluate(() => localStorage.getItem('catt_mayorista_data'));
    expect(data).toBeTruthy();
    expect(JSON.parse(data!)).toMatchObject({ nombre: 'Juan Test', negocio: 'Test SRL' });
  });

  test('código mayorista inválido muestra error @mayorista', async ({ page }) => {
    await setupPage(page);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.elegirMayorista();
    await tienda.ingresarCodigoMayorista('CODIGO-INVALIDO');
    await expect(tienda.errCodigo).toBeVisible();
    await expect(tienda.errCodigo).toContainText(/no es válido/i);
  });

  test('minorista de zona libre entra al catálogo @minorista', async ({ page }) => {
    await setupPage(page);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.elegirMinorista();
    await tienda.ingresarLocalidadMinorista('Buenos Aires', 'Bahía Blanca');
    await expect(tienda.catalog).toBeVisible();
    await expect(tienda.perfilBadge).toContainText(/minorista/i);
  });

  test('link "Solicitá una cuenta mayorista" apunta a landing #mayoristas @mayorista', async ({ page }) => {
    await setupPage(page);
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.elegirMayorista();
    await expect(tienda.reqCta).toHaveAttribute('href', './index.html#mayoristas');
  });

  test('badge perfil muestra botón "Cambiar" que reabre gate @tienda', async ({ page }) => {
    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Bahía Blanca',
      zonaStatus: 'libre'
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await expect(tienda.perfilBadge).toBeVisible();
    const btnCambiar = tienda.perfilBadge.locator('a', { hasText: 'Cambiar' });
    await btnCambiar.click();
    await expect(tienda.modalWelcome).toBeVisible();
    // catalog sigue visible detrás
    await expect(tienda.catalog).toBeVisible();
    // botón cerrar debe estar visible (perfil ya activo)
    await expect(tienda.modalCloseBtn).toBeVisible();
  });
});
