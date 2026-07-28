import { Page, Locator } from '@playwright/test';

export class ProductoPage {
  readonly page: Page;
  readonly loading: Locator;
  readonly notFound: Locator;
  readonly nombre: Locator;
  readonly precio: Locator;
  readonly desc: Locator;
  readonly talleSelected: Locator;
  readonly tallesGrid: Locator;
  readonly qtyInput: Locator;
  readonly addCartBtn: Locator;
  readonly guiaBtn: Locator;
  readonly modalGuia: Locator;
  readonly modalGuiaClose: Locator;
  readonly modalGuiaTabla: Locator;
  readonly galleryMain: Locator;
  readonly thumbs: Locator;
  readonly cartBtn: Locator;
  readonly cartCount: Locator;
  readonly drawer: Locator;
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loading = page.locator('#loading');
    this.notFound = page.locator('#not-found');
    this.nombre = page.locator('#p-name');
    this.precio = page.locator('#p-price');
    this.desc = page.locator('#p-desc');
    this.talleSelected = page.locator('#talle-selected');
    this.tallesGrid = page.locator('#talles-grid');
    this.qtyInput = page.locator('#qty');
    this.addCartBtn = page.locator('#add-cart-btn');
    this.guiaBtn = page.locator('.guia-btn');
    this.modalGuia = page.locator('#modal-guia');
    this.modalGuiaClose = page.locator('#modal-guia .modal-close');
    this.modalGuiaTabla = page.locator('#guia-tabla');
    this.galleryMain = page.locator('#gallery-main');
    this.thumbs = page.locator('#gallery-thumbs .thumb');
    this.cartBtn = page.locator('.cart-btn');
    this.cartCount = page.locator('#cart-count');
    this.drawer = page.locator('#drawer');
    this.toast = page.locator('#toast');
  }

  async goto(id: number | string) {
    await this.page.goto(`/producto.html?id=${id}`);
  }

  async esperarCarga() {
    await this.nombre.waitFor({ state: 'visible' });
  }

  async elegirTalle(talle: string) {
    await this.tallesGrid.locator('button', { hasText: new RegExp(`^${talle}$`) }).click();
  }

  async setQty(n: number) {
    await this.qtyInput.fill(String(n));
  }

  async agregarAlCarrito() {
    await this.addCartBtn.click();
  }

  async abrirGuiaTalles() {
    await this.guiaBtn.click();
    await this.modalGuia.waitFor({ state: 'visible' });
  }

  async cerrarGuiaTalles() {
    await this.modalGuiaClose.click();
  }

  async abrirCarrito() {
    await this.cartBtn.click();
    await this.drawer.waitFor({ state: 'visible' });
  }
}
