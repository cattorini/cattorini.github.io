import { test, expect } from '@playwright/test';
import { setupPage, getCollection } from '../../helpers/setup';
import { LandingPage } from '../../pages/landing.page';

test.describe('Landing — solicitud mayorista @landing @mayorista', () => {

  test('abre el modal con todos los campos requeridos @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await landing.abrirFormularioMayorista();

    await expect(landing.mayInpNombre).toBeVisible();
    await expect(landing.mayInpNegocio).toBeVisible();
    await expect(landing.mayInpCuit).toBeVisible();
    await expect(landing.maySelTipo).toBeVisible();
    await expect(landing.mayInpTel).toBeVisible();
    await expect(landing.mayInpWa).toBeVisible();
    await expect(landing.mayInpEmail).toBeVisible();
    await expect(landing.maySelProvincia).toBeVisible();
    await expect(landing.mayInpLocalidad).toBeVisible();
    await expect(landing.mayInpDireccion).toBeVisible();
    await expect(landing.mayInpCp).toBeVisible();
    await expect(landing.mayInpNotas).toBeVisible();
  });

  test('rechaza envío si falta nombre o negocio @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await landing.abrirFormularioMayorista();
    await landing.enviarFormMayorista();
    await expect(landing.mayErr).toBeVisible();
    await expect(landing.mayErr).toContainText(/nombre y negocio/i);
  });

  test('rechaza envío si falta WhatsApp Y email @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await landing.abrirFormularioMayorista();
    await landing.completarFormMayorista({ nombre: 'Juan', negocio: 'Test SRL' });
    await landing.enviarFormMayorista();
    await expect(landing.mayErr).toContainText(/whatsapp o email/i);
  });

  test('rechaza envío sin provincia o localidad @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await landing.abrirFormularioMayorista();
    await landing.completarFormMayorista({
      nombre: 'Juan', negocio: 'Test SRL', wa: '5491100000000'
    });
    await landing.enviarFormMayorista();
    await expect(landing.mayErr).toContainText(/provincia y localidad/i);
  });

  test('rechaza envío sin dirección @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await landing.abrirFormularioMayorista();
    await landing.completarFormMayorista({
      nombre: 'Juan', negocio: 'Test SRL', wa: '5491100000000',
      provincia: 'Buenos Aires', localidad: 'La Plata'
    });
    // el input de localidad usa autocomplete — como no hay una selección de la lista
    // el campo tiene valor pero la validación de dirección debería saltar primero
    await landing.enviarFormMayorista();
    await expect(landing.mayErr).toContainText(/dirección/i);
  });

  test('rechaza envío con localidad inválida (no existe en la provincia) @landing', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await landing.abrirFormularioMayorista();
    await landing.completarFormMayorista({
      nombre: 'Juan', negocio: 'Test SRL', wa: '5491100000000',
      provincia: 'Buenos Aires', localidad: 'LocalidadInexistenteXYZ',
      direccion: 'Calle 123'
    });
    await landing.enviarFormMayorista();
    await expect(landing.mayErr).toContainText(/localidad/i);
  });

  test('flujo completo: envía solicitud y muestra código de seguimiento @landing @critical', async ({ page }) => {
    await setupPage(page);
    const landing = new LandingPage(page);
    await landing.goto();
    await landing.abrirFormularioMayorista();
    await landing.completarFormMayorista({
      nombre: 'María Test',
      negocio: 'Boutique Test',
      cuit: '20-11111111-1',
      tipo: 'Tienda de ropa',
      tel: '11-1234-5678',
      wa: '5491112345678',
      email: 'test@ejemplo.com',
      provincia: 'Buenos Aires',
      localidad: 'La Plata',
      direccion: 'Calle 50 100',
      cp: '1900',
      notas: 'Test'
    });
    await landing.enviarFormMayorista();
    const code = await landing.esperarConfirmacionMayorista();
    expect(code).toMatch(/^MAY-[A-Z0-9]{4}$/);

    // Verificar que se guardó en Firestore (mock)
    const solicitudes = await getCollection(page, 'solicitudes_mayoristas');
    const docs = Object.values(solicitudes);
    expect(docs.length).toBeGreaterThan(0);
    expect((docs[0] as any).estado).toBe('pendiente');
    expect((docs[0] as any).solicitante.nombre).toBe('María Test');
  });
});
