import { Page, Locator } from '@playwright/test';

export class SeguimientoMayoristaPage {
  readonly page: Page;
  readonly searchCard: Locator;
  readonly misSolicitudesCard: Locator;
  readonly solicitudCard: Locator;
  readonly notFoundCard: Locator;
  readonly inCode: Locator;
  readonly codeDisplay: Locator;
  readonly statusBadge: Locator;
  readonly aceptadaContent: Locator;
  readonly rechazadaContent: Locator;
  readonly pendienteContent: Locator;
  readonly codigoMayoristaWrap: Locator;
  readonly codigoMayorista: Locator;
  readonly codigoMayoristaMsg: Locator;
  readonly rechazoMotivo: Locator;
  readonly waAceptada: Locator;
  readonly waConsulta: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchCard = page.locator('#search-card');
    this.misSolicitudesCard = page.locator('#mis-solicitudes-card');
    this.solicitudCard = page.locator('#solicitud-card');
    this.notFoundCard = page.locator('#not-found-card');
    this.inCode = page.locator('#in-code');
    this.codeDisplay = page.locator('#code-display');
    this.statusBadge = page.locator('#status-badge');
    this.aceptadaContent = page.locator('#aceptada-content');
    this.rechazadaContent = page.locator('#rechazada-content');
    this.pendienteContent = page.locator('#pendiente-content');
    this.codigoMayoristaWrap = page.locator('#codigo-mayorista-wrap');
    this.codigoMayorista = page.locator('#codigo-mayorista');
    this.codigoMayoristaMsg = page.locator('#codigo-mayorista-msg-text');
    this.rechazoMotivo = page.locator('#rechazo-motivo');
    this.waAceptada = page.locator('#wa-aceptada');
    this.waConsulta = page.locator('#wa-consulta');
  }

  async goto() {
    await this.page.goto('/seguimiento-mayorista.html');
  }

  async gotoConCodigo(code: string) {
    await this.page.goto(`/seguimiento-mayorista.html?code=${encodeURIComponent(code)}`);
  }
}
