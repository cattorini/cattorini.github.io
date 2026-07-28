import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';

/**
 * Estos tests requieren zonas_mayoristas cargadas en productos.json.
 * Como no queremos modificar el JSON de producción, los tests que necesitan
 * zona bloqueada verifican el comportamiento del gate cuando pre-configuramos
 * localidad + zonaStatus='bloqueada' en localStorage.
 * Los tests de validación anti-fraude en checkout requieren que productos.json
 * tenga zonas configuradas — por ahora los skipeamos como TODO.
 */

test.describe('Validación de zonas @tienda @anti-fraude', () => {

  test('minorista con zona pre-marcada bloqueada ve pantalla de derivación @anti-fraude', async ({ page }) => {
    // Setup: productos.json debe tener una zona registrada para Mar del Plata.
    // Como no la tiene por default, simulamos el flujo con setupPage + intercept del JSON
    // que agrega una zona.
    await page.route('**/productos.json', async route => {
      try {
        const resp = await route.fetch();
        const json = await resp.json();
        json.zonas_mayoristas = [{
          provincia: 'Buenos Aires',
          localidades: ['Mar del Plata'],
          mayorista: {
            nombre: 'Distribuidora del Mar',
            telefono: '223-555-1234',
            whatsapp: '5492235551234',
            direccion: 'Av. Colón 1000'
          }
        }];
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) });
      } catch (e) {
        await route.continue();
      }
    });

    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Mar del Plata',
      zonaStatus: 'bloqueada'
    });

    const tienda = new TiendaPage(page);
    await tienda.goto();
    await expect(tienda.zoneBlockedContainer).toBeVisible({ timeout: 5000 });
    await expect(tienda.zoneBlockedContainer).toContainText('Distribuidora del Mar');
  });

  test('minorista miente en gate y quiere enviar a zona bloqueada — se bloquea en checkout @anti-fraude @critical', async ({ page }) => {
    await page.route('**/productos.json', async route => {
      try {
        const resp = await route.fetch();
        const json = await resp.json();
        json.zonas_mayoristas = [{
          provincia: 'Buenos Aires',
          localidades: ['Mar del Plata'],
          mayorista: {
            nombre: 'Distribuidora del Mar',
            telefono: '223-555-1234',
            whatsapp: '5492235551234',
            direccion: 'Av. Colón 1000'
          }
        }];
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) });
      } catch (e) {
        await route.continue();
      }
    });

    await setupPage(page, {
      perfil: 'minorista',
      provincia: 'Buenos Aires',
      localidad: 'Bahía Blanca',  // se identificó de zona libre
      zonaStatus: 'libre',
      cart: [{ id: 1, nombre: 'Camisa Oxford', categoria: 'Camisas', talle: 'M', qty: 1, precio: 22000 }]
    });

    const tienda = new TiendaPage(page);
    await tienda.goto();
    /* Esperar a que ubicaciones esté cargado antes de abrir el carrito */
    await page.waitForFunction(() => (window as any).Ubicaciones && (window as any).Ubicaciones.load, undefined, { timeout: 10000 });
    await page.waitForTimeout(500); /* Dejar que descargue localidades-ar */
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await page.waitForTimeout(300);
    await tienda.llenarDatosMinorista({
      nombre: 'Test Fraude',
      direccion: 'Av. Falsa 123',
      provincia: 'Buenos Aires',
      localidad: 'Mar del Plata'  // zona bloqueada
    });
    await tienda.confirmarPedido();
    await expect(tienda.zonaBlockModal).toBeVisible({ timeout: 5000 });
    await expect(tienda.zbNombre).toContainText('Distribuidora del Mar');
  });
});
