import { Page, Locator } from '@playwright/test';

export class SeguimientoPage {
  readonly page: Page;
  readonly searchCard: Locator;
  readonly misPedidosCard: Locator;
  readonly misPedidosLista: Locator;
  readonly pedidoCard: Locator;
  readonly notFoundCard: Locator;
  readonly inCode: Locator;
  readonly searchErr: Locator;
  readonly codeDisplay: Locator;
  readonly statusMsg: Locator;
  readonly steps: Locator;
  readonly detalleCliente: Locator;
  readonly detalleItems: Locator;
  readonly detalleTotales: Locator;
  readonly detalleNota: Locator;
  readonly waConsulta: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchCard = page.locator('#search-card');
    this.misPedidosCard = page.locator('#mis-pedidos-card');
    this.misPedidosLista = page.locator('#mis-pedidos-lista');
    this.pedidoCard = page.locator('#pedido-card');
    this.notFoundCard = page.locator('#not-found-card');
    this.inCode = page.locator('#in-code');
    this.searchErr = page.locator('#search-err');
    this.codeDisplay = page.locator('#code-display');
    this.statusMsg = page.locator('#status-msg');
    this.steps = page.locator('.step');
    this.detalleCliente = page.locator('#detalle-cliente');
    this.detalleItems = page.locator('#detalle-items');
    this.detalleTotales = page.locator('#detalle-totales');
    this.detalleNota = page.locator('#detalle-nota');
    this.waConsulta = page.locator('#wa-consulta');
  }

  async goto() {
    await this.page.goto('/seguimiento.html');
  }

  async gotoConCodigo(code: string) {
    await this.page.goto(`/seguimiento.html?code=${encodeURIComponent(code)}`);
  }

  async buscarCodigo(code: string) {
    await this.inCode.fill(code);
    await this.page.locator('#search-card button[type="submit"]').click();
  }
}
