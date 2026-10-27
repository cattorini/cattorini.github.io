/**
 * XSS en las páginas PÚBLICAS: nada de lo que venga de productos.json (lo
 * edita el portal), de Firestore (pedidos/solicitudes/mayoristas, en parte
 * creados por anónimos) o del usuario se interpreta como HTML/CSS/URL.
 * Payload: <img src=x onerror="window.__xss=1"> → window.__xss debe quedar undefined.
 */
import { test, expect, Page } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { mayoristaSample, CODIGO_MAYO_INDIVIDUAL_HASH, pedidoPendienteSample, solicitudPendienteSample } from '../../fixtures/test-data';

const XSS = '<img src=x onerror="window.__xss=1">';
const IMG_MALA = `x.jpg'); background:url(javascript:window.__xss=1); x:url('`;

function envenenar(json: any) {
  json.textos = { ...(json.textos || {}), hero: { titulo: XSS, subtitulo: XSS, cta: XSS }, footer: { texto: XSS } };
  json.negocio.whatsapp = '549"><img src=x onerror="window.__xss=1">';
  json.config.envio.transportista = XSS;
  json.config.envio.leyenda = XSS;
  json.config.pago = { titular: XSS, banco: XSS };
  json.imagenes = { hero_carousel: [IMG_MALA, '"><img src=x onerror=window.__xss=1>'] };
  for (const cat of json.categorias) {
    cat.nombre = XSS + cat.nombre;
    cat.descripcion = XSS;
    cat.imagen = IMG_MALA;
    for (const p of cat.productos || []) {
      p.nombre = XSS + p.nombre;
      p.descripcion = XSS;
      p.imagenes = [IMG_MALA, ...(p.imagenes || [])];
      p.destacado = true;
    }
  }
  json.zonas_mayoristas = [{ provincia: 'Buenos Aires', localidades: ['La Plata'], mayorista: { nombre: XSS, direccion: XSS, telefono: XSS, whatsapp: XSS } }];
}

async function sinXss(page: Page) {
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  /* ningún <img> inyectado */
  expect(await page.locator('img[src="x"]').count()).toBe(0);
}

test.describe('XSS en páginas públicas @seguridad @tienda', () => {
  test('index.html con catálogo/textos hostiles @seguridad @landing', async ({ page }) => {
    await setupPage(page, { mutarCatalogo: envenenar });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#hero-titulo')).toContainText('<img');
    await sinXss(page);
    expect(await page.locator('#wa-link').getAttribute('href') || '').not.toMatch(/[<>"]/);
  });

  test('tienda.html (catálogo + carrito + zona bloqueada) con datos hostiles @seguridad', async ({ page }) => {
    await setupPage(page, {
      mutarCatalogo: envenenar, perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      cart: [{ key: 'k', id: 1, nombre: XSS, categoria: XSS, talle: XSS, color: XSS, qty: 1, precio: 1000, imagen: IMG_MALA }]
    });
    await page.goto('/tienda.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#catalog')).toContainText('<img');
    await page.locator('.cart-btn').click();
    await page.evaluate(() => (window as any).setEntrega('envio'));
    await sinXss(page);
  });

  test('producto.html con datos hostiles + stock hostil en Firestore @seguridad @producto', async ({ page }) => {
    await setupPage(page, {
      mutarCatalogo: envenenar, perfil: 'minorista', provincia: 'Buenos Aires', localidad: 'Bahía Blanca', zonaStatus: 'libre',
      firebase: { collections: { stock: { '1': { variantes: { M: { [XSS]: { cantidad: 3, hex: 'red;background:url(javascript:window.__xss=1)' } } } } } } }
    });
    await page.goto('/producto.html?id=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#p-name')).toContainText('<img');
    await page.locator('#talles-grid button', { hasText: 'M' }).first().click();
    await expect(page.locator('#colores-grid')).toContainText('<img');
    await sinXss(page);
  });

  test('tienda.html mayorista con datos hostiles en mayoristas_activos @seguridad @mayorista', async ({ page }) => {
    const hostil = { ...mayoristaSample, nombre: XSS, negocio: XSS, direccion: XSS, email: XSS, whatsapp: XSS };
    await setupPage(page, {
      perfil: 'mayorista', codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: hostil,
      cart: [{ key: 'k', id: 1, nombre: 'Camisa', categoria: 'Camisas', talle: 'M', qty: 10, precio: 14500 }],
      firebase: { collections: { mayoristas_activos: { [CODIGO_MAYO_INDIVIDUAL_HASH]: hostil } } }
    });
    await page.goto('/tienda.html', { waitUntil: 'domcontentloaded' });
    await page.locator('.cart-btn').click();
    await expect(page.locator('#mayorista-panel')).toContainText('<img');
    await sinXss(page);
  });

  test('seguimiento.html y seguimiento-mayorista.html con documentos hostiles @seguridad @seguimiento', async ({ page }) => {
    const COD = 'K7M2Q9X4PZ';
    await setupPage(page, {
      mutarCatalogo: envenenar,
      firebase: { collections: {
        pedidos: { [COD]: { ...pedidoPendienteSample, codigo: COD, nota: XSS,
          cliente: { ...pedidoPendienteSample.cliente, nombre: XSS, direccion: XSS },
          items: [{ id: 1, nombre: XSS, categoria: XSS, talle: XSS, color: XSS, qty: 1, precio: 1 }] } },
        solicitudes_mayoristas: { ['MAY-' + COD]: { ...solicitudPendienteSample, codigo: 'MAY-' + COD, notas: XSS,
          solicitante: { ...solicitudPendienteSample.solicitante, nombre: XSS, negocio: XSS } } }
      } }
    });
    await page.goto(`/seguimiento.html?code=${COD}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#detalle-cliente')).toContainText('<img');
    await sinXss(page);
    await page.goto(`/seguimiento-mayorista.html?code=MAY-${COD}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#solicitud-datos')).toContainText('<img');
    await sinXss(page);
  });
});
