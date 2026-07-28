/**
 * Helper para inyectar el mock de Firebase en cada test antes de que
 * la página cargue el SDK real. También precarga localStorage/sessionStorage
 * con perfiles pre-configurados si el test lo pide.
 */
import { Page } from '@playwright/test';
import { firebaseMockScript, FirebaseMockState } from '../fixtures/firebase-mock';
import { CODIGO_MASTER_HASH, CODIGO_MAYO_INDIVIDUAL_HASH } from '../fixtures/test-data';

export interface SetupOptions {
  firebase?: FirebaseMockState;
  /** Perfil pre-configurado del cliente al abrir la página */
  perfil?: 'minorista' | 'mayorista' | null;
  /** Solo aplica si perfil = minorista */
  localidad?: string;
  provincia?: string;
  zonaStatus?: 'libre' | 'bloqueada';
  /** Solo aplica si perfil = mayorista con código individual */
  mayoristaData?: any;
  /** Solo aplica si perfil = mayorista */
  codigoHashValido?: string;
  /** Items pre-cargados en el carrito */
  cart?: Array<{ id: number; nombre: string; categoria: string; talle: string; qty: number; precio: number; imagen?: string }>;
  /** Códigos guardados en catt_mis_pedidos */
  misPedidos?: Array<{ code: string; docId: string | null; ts: number }>;
  /** Códigos guardados en catt_mis_solicitudes */
  misSolicitudes?: Array<{ code: string; docId: string | null; ts: number }>;
  /** Sesión activa del portal (PAT + password ya configurados) */
  portalSession?: boolean;
}

/**
 * Inicializa la página con el estado deseado.
 * DEBE llamarse antes de page.goto().
 */
export async function setupPage(page: Page, opts: SetupOptions = {}) {
  const firebase = opts.firebase || {};
  const script = firebaseMockScript(firebase);

  // 1a) Bloquear la carga del SDK real de Firebase para que no pise nuestro mock
  await page.route(/gstatic\.com\/firebasejs\//, route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '/* firebase SDK bloqueado por tests */'
  }));
  // Y también cualquier request a Firebase (por si algo se escapa)
  await page.route(/googleapis\.com/, route => route.fulfill({ status: 200, body: '{}' }));
  // Bloquear el Service Worker en tests para evitar cache stale y comportamientos inconsistentes
  await page.route('**/sw.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: '/* sw disabled in tests */'
  }));

  // 1b) Inyectar mock de Firebase antes de que cargue nada
  await page.addInitScript({ content: script });

  // 2) Pre-configurar localStorage si viene el perfil
  const perfilCfg = {
    perfil: opts.perfil || null,
    localidad: opts.localidad || '',
    provincia: opts.provincia || '',
    zonaStatus: opts.zonaStatus || null,
    mayoristaData: opts.mayoristaData || null,
    codigoHashValido: opts.codigoHashValido || null,
    cart: opts.cart || null,
    misPedidos: opts.misPedidos || null,
    misSolicitudes: opts.misSolicitudes || null,
    portalSession: !!opts.portalSession
  };

  await page.addInitScript((cfg) => {
    try {
      if (cfg.perfil) {
        localStorage.setItem('catt_perfil', cfg.perfil);
        if (cfg.perfil === 'minorista') {
          if (cfg.localidad || cfg.provincia) {
            localStorage.setItem('catt_localidad', (cfg.localidad || '') + ', ' + (cfg.provincia || ''));
          }
          if (cfg.zonaStatus) localStorage.setItem('catt_zona_status', cfg.zonaStatus);
        }
        if (cfg.perfil === 'mayorista') {
          if (cfg.codigoHashValido) sessionStorage.setItem('catt_codigo_valido_hash', cfg.codigoHashValido);
          if (cfg.mayoristaData) localStorage.setItem('catt_mayorista_data', JSON.stringify(cfg.mayoristaData));
        }
      }
      if (cfg.cart) localStorage.setItem('catt_cart_v2', JSON.stringify(cfg.cart));
      if (cfg.misPedidos) localStorage.setItem('catt_mis_pedidos', JSON.stringify(cfg.misPedidos));
      if (cfg.misSolicitudes) localStorage.setItem('catt_mis_solicitudes', JSON.stringify(cfg.misSolicitudes));
      if (cfg.portalSession) {
        sessionStorage.setItem('catt_pat_session', 'ghp_fake_test_token_for_playwright');
        sessionStorage.setItem('catt_pedidos_session', 'ok');
      }
    } catch (e) { console.warn('setup init script error', e); }
  }, perfilCfg);
}

/** Helper para setear una colección de Firestore desde un test */
export async function setCollection(page: Page, name: string, docs: Record<string, any>) {
  await page.evaluate(({ n, d }) => (window as any).__firebaseMock.setCollection(n, d), { n: name, d: docs });
}

/** Helper para leer el estado actual de una colección */
export async function getCollection(page: Page, name: string) {
  return page.evaluate((n) => (window as any).__firebaseMock.getCollection(n), name);
}

/** Helper: espera a que se complete cualquier animación en curso */
export async function waitAnimations(page: Page, ms = 300) {
  await page.waitForTimeout(ms);
}
