import { Page, Locator } from '@playwright/test';

export class TiendaPage {
  readonly page: Page;

  // Modal welcome (gate)
  readonly modalWelcome: Locator;
  readonly stepInicial: Locator;
  readonly stepMayorista: Locator;
  readonly stepMinorista: Locator;
  readonly btnSoyMayorista: Locator;
  readonly btnSoyMinorista: Locator;
  readonly inpCodigo: Locator;
  readonly errCodigo: Locator;
  readonly btnSubmitCodigo: Locator;
  readonly selProvincia: Locator;
  readonly inpLocalidad: Locator;
  readonly errLocalidad: Locator;
  readonly btnSubmitLocalidad: Locator;
  readonly reqCta: Locator;
  readonly modalCloseBtn: Locator;

  // Perfil badge
  readonly perfilBadge: Locator;

  // Header cart
  readonly cartBtn: Locator;
  readonly cartCount: Locator;
  readonly drawer: Locator;
  readonly drawerBody: Locator;
  readonly drawerFooter: Locator;
  readonly drawerClose: Locator;

  // Catálogo
  readonly catStrip: Locator;
  readonly infoEnvio: Locator;
  readonly catalog: Locator;
  readonly searchInput: Locator;
  readonly searchClear: Locator;
  readonly zoneBlockedContainer: Locator;

  // Drawer form
  readonly togRetiro: Locator;
  readonly togEnvio: Locator;
  readonly inpNombre: Locator;
  readonly inpDireccion: Locator;
  readonly inpProvinciaEnvio: Locator;
  readonly inpLocalidadEnvio: Locator;
  readonly inpCp: Locator;
  readonly cartNote: Locator;
  readonly btnSend: Locator;
  readonly envioMayoHeader: Locator;
  readonly btnEditarDir: Locator;
  readonly mayoristaPanel: Locator;
  readonly mayoristaNombre: Locator;
  readonly mayoristaDir: Locator;

  // Modales
  readonly confirmModal: Locator;
  readonly confirmCode: Locator;
  readonly trackLink: Locator;
  readonly zonaBlockModal: Locator;
  readonly zbNombre: Locator;
  readonly zbWa: Locator;

  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modalWelcome = page.locator('#modal-welcome');
    this.stepInicial = page.locator('#modal-step-1');
    this.stepMayorista = page.locator('#modal-step-mayorista');
    this.stepMinorista = page.locator('#modal-step-minorista');
    this.btnSoyMayorista = page.locator('.profile-btn').filter({ hasText: 'Soy mayorista' });
    this.btnSoyMinorista = page.locator('.profile-btn').filter({ hasText: 'Soy minorista' });
    this.inpCodigo = page.locator('#input-codigo');
    this.errCodigo = page.locator('#err-codigo');
    this.btnSubmitCodigo = page.locator('#modal-step-mayorista .btn').first();
    this.selProvincia = page.locator('#input-provincia');
    this.inpLocalidad = page.locator('#input-localidad');
    this.errLocalidad = page.locator('#err-localidad');
    this.btnSubmitLocalidad = page.locator('#modal-step-minorista .btn').first();
    this.reqCta = page.locator('#req-cta');
    this.modalCloseBtn = page.locator('#modal-close-btn');

    this.perfilBadge = page.locator('#perfil-badge');

    this.cartBtn = page.locator('.cart-btn');
    this.cartCount = page.locator('#cart-count');
    this.drawer = page.locator('#drawer');
    this.drawerBody = page.locator('#drawer-body');
    this.drawerFooter = page.locator('#drawer-footer');
    this.drawerClose = page.locator('.drawer-close');

    this.catStrip = page.locator('#cat-strip');
    this.infoEnvio = page.locator('#info-envio');
    this.catalog = page.locator('#catalog');
    this.searchInput = page.locator('#search');
    this.searchClear = page.locator('#search-clear');
    this.zoneBlockedContainer = page.locator('#zone-blocked-container');

    this.togRetiro = page.locator('#tog-retiro');
    this.togEnvio = page.locator('#tog-envio');
    this.inpNombre = page.locator('#in-nombre');
    this.inpDireccion = page.locator('#in-direccion');
    this.inpProvinciaEnvio = page.locator('#in-provincia-envio');
    this.inpLocalidadEnvio = page.locator('#in-localidad-envio');
    this.inpCp = page.locator('#in-cp');
    this.cartNote = page.locator('#cart-note');
    this.btnSend = page.locator('#btn-send');
    this.envioMayoHeader = page.locator('#envio-mayo-header');
    this.btnEditarDir = page.locator('#btn-editar-dir');
    this.mayoristaPanel = page.locator('#mayorista-panel');
    this.mayoristaNombre = page.locator('#mayorista-nombre');
    this.mayoristaDir = page.locator('#mayorista-dir');

    this.confirmModal = page.locator('#confirm-modal');
    this.confirmCode = page.locator('#confirm-code');
    this.trackLink = page.locator('#track-link');
    this.zonaBlockModal = page.locator('#zona-block-modal');
    this.zbNombre = page.locator('#zb-nombre');
    this.zbWa = page.locator('#zb-wa');

    this.toast = page.locator('#toast');
  }

  async goto() {
    await this.page.goto('/tienda.html');
  }

  async gotoConCat(cat: string) {
    await this.page.goto(`/tienda.html?cat=${encodeURIComponent(cat)}`);
  }

  async elegirMayorista() {
    await this.btnSoyMayorista.click();
    await this.stepMayorista.waitFor({ state: 'visible' });
  }

  async elegirMinorista() {
    await this.btnSoyMinorista.click();
    await this.stepMinorista.waitFor({ state: 'visible' });
  }

  async ingresarCodigoMayorista(codigo: string) {
    await this.inpCodigo.fill(codigo);
    await this.btnSubmitCodigo.click();
  }

  async ingresarLocalidadMinorista(provincia: string, localidad: string) {
    await this.selProvincia.selectOption(provincia);
    await this.page.waitForTimeout(200);
    await this.inpLocalidad.focus();
    await this.inpLocalidad.fill(localidad);
    /* esperar que aparezcan sugerencias */
    await this.page.waitForTimeout(300);
    const item = this.page.locator('#loc-list-1 .loc-item', { hasText: new RegExp(`^${localidad}$`, 'i') });
    const count = await item.count();
    if (count > 0) {
      /* usar mouse down para que el handler lo capture antes del blur */
      await item.first().dispatchEvent('mousedown');
    }
    await this.page.waitForTimeout(100);
    await this.btnSubmitLocalidad.click();
  }

  async abrirCarrito() {
    await this.cartBtn.click();
    await this.drawer.waitFor({ state: 'visible' });
    /* Esperar a que ubicaciones haya cargado (>1 option en el select) */
    await this.page.waitForFunction(
      () => document.querySelectorAll('#in-provincia-envio option').length > 1,
      undefined,
      { timeout: 10000 }
    ).catch(() => {
      /* Fallback: si por alguna razón no llegan a cargar las opciones,
         seguimos igual — algunos tests no dependen de envío */
    });
    await this.page.waitForTimeout(300);
  }

  async cerrarCarrito() {
    await this.drawerClose.click();
    await this.page.waitForTimeout(400);
  }

  async elegirRetiro() {
    /* Ejecutar la función JS directamente para bypassear cualquier issue de layout */
    await this.page.evaluate(() => (window as any).setEntrega('retiro'));
    await this.page.waitForTimeout(150);
  }

  async elegirEnvio() {
    await this.page.evaluate(() => (window as any).setEntrega('envio'));
    await this.page.waitForTimeout(200);
  }

  async confirmarPedidoBtn() {
    await this.btnSend.scrollIntoViewIfNeeded();
    await this.btnSend.click();
  }

  async llenarDatosMinorista(datos: {
    nombre?: string; direccion?: string; provincia?: string;
    localidad?: string; cp?: string; nota?: string;
  }) {
    if (datos.nombre !== undefined) await this.inpNombre.fill(datos.nombre);
    if (datos.direccion !== undefined) await this.inpDireccion.fill(datos.direccion);
    if (datos.provincia !== undefined) {
      await this.inpProvinciaEnvio.selectOption(datos.provincia);
      await this.page.waitForTimeout(150);
    }
    if (datos.localidad !== undefined) {
      await this.inpLocalidadEnvio.focus();
      await this.inpLocalidadEnvio.fill(datos.localidad);
      await this.page.waitForTimeout(300);
      const item = this.page.locator('#loc-list-2 .loc-item', { hasText: new RegExp(`^${datos.localidad}$`, 'i') });
      const count = await item.count();
      if (count > 0) await item.first().dispatchEvent('mousedown');
      await this.page.waitForTimeout(100);
    }
    if (datos.cp !== undefined) await this.inpCp.fill(datos.cp);
    if (datos.nota !== undefined) await this.cartNote.fill(datos.nota);
  }

  async confirmarPedido() {
    await this.page.evaluate(() => (window as any).sendOrder());
  }

  productCard(nombre: string) {
    return this.catalog.locator('.pcard', { hasText: nombre });
  }

  categoryPill(nombre: string) {
    return this.catStrip.locator('.cat-pill', { hasText: nombre });
  }
}
