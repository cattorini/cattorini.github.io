import { test, expect } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';
import { mayoristaSample, CODIGO_MAYO_INDIVIDUAL_HASH } from '../../fixtures/test-data';

/* Ya no existe código maestro: el perfil mayorista se revalida contra
   mayoristas_activos/{sha256(código individual)} en cada visita. */
const activos = (data: any) => ({ collections: { mayoristas_activos: { [CODIGO_MAYO_INDIVIDUAL_HASH]: data } } });

const cartMayo = [
  { id: 1, nombre: 'Camisa Oxford Blanca', categoria: 'Camisas', talle: 'M', qty: 5, precio: 14500 }
];

test.describe('Checkout mayorista con datos @tienda @checkout @mayorista', () => {

  test('panel resumen del mayorista aparece cuando tiene datos @mayorista', async ({ page }) => {
    await setupPage(page, {
      perfil: 'mayorista',
      codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH,
      mayoristaData: mayoristaSample, firebase: activos(mayoristaSample),
      cart: cartMayo
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await expect(tienda.mayoristaPanel).toBeVisible();
    await expect(tienda.mayoristaNombre).toContainText(mayoristaSample.nombre);
    await expect(tienda.mayoristaNombre).toContainText(mayoristaSample.negocio);
    await expect(tienda.inpNombre).toBeHidden();
  });

  test('envío con dirección pre-llenada y deshabilitada + botón Editar @mayorista', async ({ page }) => {
    await setupPage(page, {
      perfil: 'mayorista', codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: mayoristaSample, firebase: activos(mayoristaSample), cart: cartMayo
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await expect(tienda.envioMayoHeader).toBeVisible();
    await expect(tienda.btnEditarDir).toBeVisible();
    await expect(tienda.inpDireccion).toHaveValue(mayoristaSample.direccion);
    await expect(tienda.inpDireccion).toBeDisabled();
  });

  test('click en Editar desbloquea los campos de dirección @mayorista', async ({ page }) => {
    await setupPage(page, {
      perfil: 'mayorista', codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: mayoristaSample, firebase: activos(mayoristaSample), cart: cartMayo
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await tienda.btnEditarDir.click();
    await expect(tienda.inpDireccion).toBeEnabled();
    await expect(tienda.envioMayoHeader).toBeHidden();
  });

  test('mayorista sin dirección — campos aparecen editables y vacíos @mayorista', async ({ page }) => {
    const mayoSinDir = { ...mayoristaSample, direccion: '', codigoPostal: '' };
    await setupPage(page, {
      perfil: 'mayorista', codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: mayoSinDir, firebase: activos(mayoSinDir), cart: cartMayo
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    await expect(tienda.envioMayoHeader).toBeHidden();
    await expect(tienda.inpDireccion).toBeEnabled();
  });

  test('flujo completo envío usa datos del mayorista @mayorista @critical', async ({ page }) => {
    await setupPage(page, {
      perfil: 'mayorista', codigoHashValido: CODIGO_MAYO_INDIVIDUAL_HASH, mayoristaData: mayoristaSample, firebase: activos(mayoristaSample), cart: cartMayo
    });
    const tienda = new TiendaPage(page);
    await tienda.goto();
    await tienda.abrirCarrito();
    await tienda.elegirEnvio();
    /* Los datos del mayorista ya están pre-llenados; confirmamos directo */
    await tienda.confirmarPedido();
    await expect(tienda.confirmModal).toBeVisible({ timeout: 5000 });

    const pedidos = await getCollection(page, 'pedidos');
    const docs = Object.values(pedidos) as any[];
    expect(docs.length).toBe(1);
    expect(docs[0].cliente.nombre).toBe(mayoristaSample.nombre);
    expect(docs[0].cliente.negocio).toBe(mayoristaSample.negocio);
    expect(docs[0].cliente.whatsapp).toBe(mayoristaSample.whatsapp);
    expect(docs[0].cliente.direccion).toBe(mayoristaSample.direccion);
    expect(docs[0].cliente.perfil).toBe('mayorista');
  });
});
