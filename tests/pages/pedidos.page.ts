import { Page, Locator } from '@playwright/test';

export class PedidosPage {
  readonly page: Page;
  readonly authScreen: Locator;
  readonly appScreen: Locator;
  readonly rtBadge: Locator;

  // Kanban
  readonly cPend: Locator;
  readonly cPrep: Locator;
  readonly cListo: Locator;
  readonly cEnviado: Locator;
  readonly bodyPend: Locator;
  readonly bodyPrep: Locator;
  readonly bodyListo: Locator;
  readonly bodyEnviado: Locator;

  // Modal detalle
  readonly modalDetail: Locator;
  readonly detailContent: Locator;
  readonly modalDetailClose: Locator;

  // Modal manual
  readonly modalManual: Locator;
  readonly mPerfilMino: Locator;
  readonly mPerfilMayo: Locator;
  readonly mDatosMino: Locator;
  readonly mDatosMayo: Locator;
  readonly mNombre: Locator;
  readonly mMayoristaSel: Locator;
  readonly mMayoristaInfo: Locator;
  readonly mTogRetiro: Locator;
  readonly mTogEnvio: Locator;
  readonly mEnvioWrap: Locator;
  readonly mDir: Locator;
  readonly mLoc: Locator;
  readonly mProv: Locator;
  readonly mCp: Locator;
  readonly mProducto: Locator;
  readonly mTalle: Locator;
  readonly mQty: Locator;
  readonly mPrecio: Locator;
  readonly mAgregarBtn: Locator;
  readonly mItems: Locator;
  readonly mNota: Locator;
  readonly mSub: Locator;
  readonly mEnv: Locator;
  readonly mTot: Locator;
  readonly mSubmitBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.authScreen = page.locator('#auth-screen');
    this.appScreen = page.locator('#app-screen');
    this.rtBadge = page.locator('#rt-badge');
    this.cPend = page.locator('#c-pend');
    this.cPrep = page.locator('#c-prep');
    this.cListo = page.locator('#c-listo');
    this.cEnviado = page.locator('#c-enviado');
    this.bodyPend = page.locator('#body-pend');
    this.bodyPrep = page.locator('#body-prep');
    this.bodyListo = page.locator('#body-listo');
    this.bodyEnviado = page.locator('#body-enviado');
    this.modalDetail = page.locator('#modal-detail');
    this.detailContent = page.locator('#detail-content');
    this.modalDetailClose = page.locator('#modal-detail .modal-close');
    this.modalManual = page.locator('#modal-manual');
    this.mPerfilMino = page.locator('#m-perfil-mino');
    this.mPerfilMayo = page.locator('#m-perfil-mayo');
    this.mDatosMino = page.locator('#m-datos-mino');
    this.mDatosMayo = page.locator('#m-datos-mayo');
    this.mNombre = page.locator('#m-nombre');
    this.mMayoristaSel = page.locator('#m-mayorista-sel');
    this.mMayoristaInfo = page.locator('#m-mayorista-info');
    this.mTogRetiro = page.locator('#m-tog-retiro');
    this.mTogEnvio = page.locator('#m-tog-envio');
    this.mEnvioWrap = page.locator('#m-envio-wrap');
    this.mDir = page.locator('#m-dir');
    this.mLoc = page.locator('#m-loc');
    this.mProv = page.locator('#m-prov');
    this.mCp = page.locator('#m-cp');
    this.mProducto = page.locator('#m-producto');
    this.mTalle = page.locator('#m-talle');
    this.mQty = page.locator('#m-qty');
    this.mPrecio = page.locator('#m-precio');
    this.mAgregarBtn = page.locator('#modal-manual .btn-ghost').filter({ hasText: '+ Agregar' });
    this.mItems = page.locator('#m-items');
    this.mNota = page.locator('#m-nota');
    this.mSub = page.locator('#m-sub');
    this.mEnv = page.locator('#m-env');
    this.mTot = page.locator('#m-tot');
    this.mSubmitBtn = page.locator('#modal-manual .btn').filter({ hasText: 'Crear pedido' });
  }

  async goto() {
    await this.page.goto('/pedidos.html');
  }

  tab(name: string) {
    return this.page.locator(`.tab-btn[data-tab="${name}"]`);
  }

  async abrirTab(name: string) {
    await this.tab(name).click();
    await this.page.locator(`#tab-${name}`).waitFor({ state: 'visible' });
  }

  filterPill(filter: string) {
    return this.page.locator(`.filter-pill[data-filter="${filter}"]`);
  }
}
