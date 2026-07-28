import { Page, Locator } from '@playwright/test';

export class PortalPage {
  readonly page: Page;

  // Login
  readonly loginScreen: Locator;
  readonly loginFirst: Locator;
  readonly loginRecurring: Locator;
  readonly inPat: Locator;
  readonly inPass: Locator;
  readonly inPass2: Locator;
  readonly errSetup: Locator;
  readonly setupBtn: Locator;
  readonly inPassR: Locator;
  readonly errLogin: Locator;
  readonly loginBtn: Locator;
  readonly resetBtn: Locator;

  // App
  readonly appScreen: Locator;
  readonly saveStatus: Locator;
  readonly saveBar: Locator;
  readonly publishBtn: Locator;

  // Tabs
  readonly badgeSol: Locator;
  readonly badgeSubSol: Locator;
  readonly badgeActivos: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loginScreen = page.locator('#login-screen');
    this.loginFirst = page.locator('#login-first');
    this.loginRecurring = page.locator('#login-recurring');
    this.inPat = page.locator('#in-pat');
    this.inPass = page.locator('#in-pass');
    this.inPass2 = page.locator('#in-pass2');
    this.errSetup = page.locator('#err-setup');
    this.setupBtn = page.locator('#login-first button.btn').first();
    this.inPassR = page.locator('#in-pass-r');
    this.errLogin = page.locator('#err-login');
    this.loginBtn = page.locator('#login-recurring button.btn').first();
    this.resetBtn = page.locator('#login-recurring button.btn-ghost').first();

    this.appScreen = page.locator('#app-screen');
    this.saveStatus = page.locator('#save-status');
    this.saveBar = page.locator('#save-bar');
    this.publishBtn = page.locator('#save-bar button');

    this.badgeSol = page.locator('#badge-sol');
    this.badgeSubSol = page.locator('#badge-sub-sol');
    this.badgeActivos = page.locator('#badge-activos');
  }

  async goto() {
    await this.page.goto('/portal.html');
  }

  async setupInicial(pat: string, pass: string, passConfirm?: string) {
    await this.loginFirst.waitFor({ state: 'visible' });
    await this.inPat.fill(pat);
    await this.inPass.fill(pass);
    await this.inPass2.fill(passConfirm !== undefined ? passConfirm : pass);
    await this.setupBtn.click();
  }

  async loginConPassword(pass: string) {
    await this.loginRecurring.waitFor({ state: 'visible' });
    await this.inPassR.fill(pass);
    await this.loginBtn.click();
  }

  tab(name: string) {
    return this.page.locator(`.tab-btn[data-tab="${name}"]`);
  }

  subtab(name: string) {
    return this.page.locator(`.subtab-btn[data-subtab="${name}"]`);
  }

  panel(name: string) {
    return this.page.locator(`#tab-${name}`);
  }

  subpanel(name: string) {
    return this.page.locator(`#subtab-${name}`);
  }

  async abrirTab(name: string) {
    await this.tab(name).click();
    await this.panel(name).waitFor({ state: 'visible' });
  }

  async abrirSubtab(name: string) {
    await this.subtab(name).click();
    await this.subpanel(name).waitFor({ state: 'visible' });
  }
}
