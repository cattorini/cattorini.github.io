import { Page, Locator, expect } from '@playwright/test';

export class LandingPage {
  readonly page: Page;
  readonly heroTitle: Locator;
  readonly navEstado: Locator;
  readonly categoriasGrid: Locator;
  readonly destacadosGrid: Locator;
  readonly ctaMayorista: Locator;
  readonly ctaConsultarSolicitud: Locator;
  readonly linkTienda: Locator;
  readonly mapaIframe: Locator;

  readonly mayModal: Locator;
  readonly mayInpNombre: Locator;
  readonly mayInpNegocio: Locator;
  readonly mayInpCuit: Locator;
  readonly maySelTipo: Locator;
  readonly mayInpTel: Locator;
  readonly mayInpWa: Locator;
  readonly mayInpEmail: Locator;
  readonly maySelProvincia: Locator;
  readonly mayInpLocalidad: Locator;
  readonly mayInpDireccion: Locator;
  readonly mayInpCp: Locator;
  readonly mayInpNotas: Locator;
  readonly maySubmitBtn: Locator;
  readonly mayErr: Locator;
  readonly mayConfirmCode: Locator;
  readonly mayTrackLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heroTitle = page.locator('#hero-titulo');
    this.navEstado = page.locator('#nav-estado');
    this.categoriasGrid = page.locator('#categorias-grid');
    this.destacadosGrid = page.locator('#destacados-grid');
    this.ctaMayorista = page.locator('#mayoristas-cta');
    this.ctaConsultarSolicitud = page.locator('a[href="./seguimiento-mayorista.html"]').first();
    this.linkTienda = page.locator('a[href="./tienda.html"]').first();
    this.mapaIframe = page.locator('#maps-iframe');

    this.mayModal = page.locator('#may-modal');
    this.mayInpNombre = page.locator('#may-nombre');
    this.mayInpNegocio = page.locator('#may-negocio');
    this.mayInpCuit = page.locator('#may-cuit');
    this.maySelTipo = page.locator('#may-tipo');
    this.mayInpTel = page.locator('#may-tel');
    this.mayInpWa = page.locator('#may-wa');
    this.mayInpEmail = page.locator('#may-email');
    this.maySelProvincia = page.locator('#may-provincia');
    this.mayInpLocalidad = page.locator('#may-localidad');
    this.mayInpDireccion = page.locator('#may-direccion');
    this.mayInpCp = page.locator('#may-cp');
    this.mayInpNotas = page.locator('#may-notas');
    this.maySubmitBtn = page.locator('#may-submit-btn');
    this.mayErr = page.locator('#may-err');
    this.mayConfirmCode = page.locator('#may-confirm-code');
    this.mayTrackLink = page.locator('#may-track-link');
  }

  async goto() {
    await this.page.goto('/index.html');
    await this.heroTitle.waitFor();
  }

  async gotoConHashMayoristas() {
    await this.page.goto('/index.html#mayoristas');
    await this.heroTitle.waitFor();
  }

  async abrirFormularioMayorista() {
    await this.ctaMayorista.click();
    await this.mayModal.waitFor({ state: 'visible' });
  }

  async cerrarFormularioMayorista() {
    // Botón X
    await this.page.locator('.may-close').click();
  }

  async completarFormMayorista(data: {
    nombre?: string; negocio?: string; cuit?: string; tipo?: string;
    tel?: string; wa?: string; email?: string;
    provincia?: string; localidad?: string; direccion?: string; cp?: string; notas?: string;
  }) {
    if (data.nombre !== undefined) await this.mayInpNombre.fill(data.nombre);
    if (data.negocio !== undefined) await this.mayInpNegocio.fill(data.negocio);
    if (data.cuit !== undefined) await this.mayInpCuit.fill(data.cuit);
    if (data.tipo !== undefined) await this.maySelTipo.selectOption(data.tipo);
    if (data.tel !== undefined) await this.mayInpTel.fill(data.tel);
    if (data.wa !== undefined) await this.mayInpWa.fill(data.wa);
    if (data.email !== undefined) await this.mayInpEmail.fill(data.email);
    if (data.provincia !== undefined) {
      await this.maySelProvincia.selectOption(data.provincia);
      // esperar un tick para que se habilite localidad
      await this.page.waitForTimeout(100);
    }
    if (data.localidad !== undefined) await this.mayInpLocalidad.fill(data.localidad);
    if (data.direccion !== undefined) await this.mayInpDireccion.fill(data.direccion);
    if (data.cp !== undefined) await this.mayInpCp.fill(data.cp);
    if (data.notas !== undefined) await this.mayInpNotas.fill(data.notas);
  }

  async enviarFormMayorista() {
    await this.maySubmitBtn.click();
  }

  async esperarConfirmacionMayorista() {
    await this.mayConfirmCode.waitFor({ state: 'visible' });
    return await this.mayConfirmCode.textContent() || '';
  }
}
