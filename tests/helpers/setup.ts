/**
 * Helper para inyectar el mock de Firebase en cada test antes de que
 * la página cargue el SDK real. También precarga localStorage/sessionStorage
 * con perfiles pre-configurados si el test lo pide.
 *
 * Aislamiento de red (obligatorio para un cliente en producción):
 *  - El SDK real de Firebase (gstatic) se reemplaza por un stub.
 *  - Cualquier request a *.googleapis.com, *.firebaseapp.com,
 *    *.firebaseio.com o api.github.com se intercepta y NUNCA sale a la red.
 *    Se registran en una lista (getExternalRequests) para que los tests
 *    puedan afirmar que hubo cero intentos.
 *  - La API de contenidos de GitHub (la que usa el portal para leer/publicar
 *    productos.json) se mockea en memoria (getGithubPuts).
 *
 * Catálogo: por default se sirve fixtures/productos.fixture.json en lugar
 * del productos.json real (que el cliente edita a diario desde el portal y
 * hacía que los tests se rompieran solos). Con `catalogo: 'real'` se usa el
 * real.
 */
import { Page, Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { firebaseMockScript, FirebaseMockState } from '../fixtures/firebase-mock';
import { STAFF_EMAIL, STAFF_PASS } from '../fixtures/test-data';

const FIXTURE_PATH = resolve(__dirname, '../fixtures/productos.fixture.json');

export function catalogoFixture(): any {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

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
  cart?: Array<{ id: number; nombre: string; categoria: string; talle: string; qty: number; precio: number; imagen?: string; color?: string | null; key?: string }>;
  /** Códigos guardados en catt_mis_pedidos */
  misPedidos?: Array<{ code: string; docId: string | null; ts: number }>;
  /** Códigos guardados en catt_mis_solicitudes */
  misSolicitudes?: Array<{ code: string; docId: string | null; ts: number }>;
  /** Marca de sesión de portal/pedidos en sessionStorage (la que hoy saltea el login de pedidos.html) */
  portalSession?: boolean;
  /** 'fixture' (default) sirve fixtures/productos.fixture.json; 'real' sirve el productos.json del repo */
  catalogo?: 'fixture' | 'real';
  /** Permite modificar el catálogo servido (p.ej. agregar zonas_mayoristas) */
  mutarCatalogo?: (json: any) => void;
}

interface NetState {
  external: string[];
  githubPuts: Array<{ path: string; body: any }>;
  githubFiles: Record<string, { content: string; sha: string }>;
}
const netState = new WeakMap<Page, NetState>();

const EXTERNAL_RE = /^https?:\/\/([^/]*\.)?(googleapis\.com|firebaseapp\.com|firebaseio\.com|firebase\.google\.com|identitytoolkit\.googleapis\.com|api\.github\.com)(\/|$)/;

/**
 * Inicializa la página con el estado deseado.
 * DEBE llamarse antes de page.goto().
 */
export async function setupPage(page: Page, opts: SetupOptions = {}) {
  const firebase: FirebaseMockState = {
    ...(opts.firebase || {}),
    authUsers: { [STAFF_EMAIL]: STAFF_PASS, ...((opts.firebase && opts.firebase.authUsers) || {}) }
  };
  const script = firebaseMockScript(firebase);

  /* Catálogo servido (fixture por default) */
  const catalogoReal = JSON.parse(readFileSync(resolve(__dirname, '../../productos.json'), 'utf8'));
  const catalogo = opts.catalogo === 'real' ? catalogoReal : catalogoFixture();
  if (opts.mutarCatalogo) opts.mutarCatalogo(catalogo);
  const catalogoStr = JSON.stringify(catalogo, null, 2);

  const st: NetState = {
    external: [],
    githubPuts: [],
    githubFiles: {
      'productos.json': { content: Buffer.from(catalogoStr, 'utf8').toString('base64'), sha: 'sha-productos-0' }
    }
  };
  netState.set(page, st);

  /* 0) Registrar TODO request externo prohibido (aunque después lo frenemos) */
  page.on('request', (req: Request) => {
    if (EXTERNAL_RE.test(req.url())) st.external.push(req.method() + ' ' + req.url());
  });

  /* 1a) Bloquear la carga del SDK real de Firebase para que no pise nuestro mock */
  await page.route(/gstatic\.com\/firebasejs\//, route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '/* firebase SDK bloqueado por tests */'
  }));

  /* 1b) Cortar cualquier request a backends reales de Firebase */
  /*     (incluye fonts.googleapis.com: no hace falta para testear y así
         ningún request a *.googleapis.com sale de la máquina) */
  await page.route(/^https?:\/\/([^/]*\.)?(googleapis\.com|firebaseapp\.com|firebaseio\.com|firebase\.google\.com)\//,
    route => route.abort('blockedbyclient'));

  /* 1c) Mock de la API de contenidos de GitHub (portal) — nunca sale a la red */
  await page.route(/^https:\/\/api\.github\.com\//, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (!m) return route.fulfill({ status: 404, body: '{}' });
    const path = decodeURIComponent(m[1]);
    if (req.method() === 'GET') {
      const f = st.githubFiles[path];
      if (!f) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ path, sha: f.sha, content: f.content, encoding: 'base64' }) });
    }
    if (req.method() === 'PUT') {
      const body = req.postDataJSON();
      const sha = 'sha-' + path + '-' + (st.githubPuts.length + 1);
      st.githubPuts.push({ path, body });
      st.githubFiles[path] = { content: body.content, sha };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { path, sha } }) });
    }
    return route.fulfill({ status: 405, body: '{}' });
  });

  /* 1d) Servir el catálogo */
  await page.route(url => /^(127\.0\.0\.1|localhost)$/.test(url.hostname) && url.pathname.endsWith('/productos.json'), route => route.fulfill({
    status: 200, contentType: 'application/json', body: catalogoStr
  }));

  /* 1e) Bloquear el Service Worker en tests para evitar cache stale */
  await page.route('**/sw.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: '/* sw disabled in tests */'
  }));

  /* 2) Inyectar mock de Firebase antes de que cargue nada */
  await page.addInitScript({ content: script });

  /* 3) Pre-configurar storage */
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
      /* Solo la primera carga de la pestaña: no pisar lo que la app guarde
         si el test recarga/navega dentro del mismo page. */
      if (sessionStorage.getItem('__catt_test_seeded')) return;
      sessionStorage.setItem('__catt_test_seeded', '1');
      if (cfg.perfil) {
        localStorage.setItem('catt_perfil', cfg.perfil);
        if (cfg.perfil === 'minorista') {
          if (cfg.localidad || cfg.provincia) {
            localStorage.setItem('catt_localidad', (cfg.localidad || '') + ', ' + (cfg.provincia || ''));
          }
          if (cfg.zonaStatus) localStorage.setItem('catt_zona_status', cfg.zonaStatus);
        }
        if (cfg.perfil === 'mayorista') {
          if (cfg.codigoHashValido) {
            /* La tienda lo lee de localStorage (antes era sessionStorage) */
            localStorage.setItem('catt_codigo_valido_hash', cfg.codigoHashValido);
            sessionStorage.setItem('catt_codigo_valido_hash', cfg.codigoHashValido);
          }
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

/** Requests a backends externos (Firebase/Google APIs/GitHub API) que la página INTENTÓ hacer */
export function getExternalRequests(page: Page): string[] {
  return (netState.get(page)?.external || []).slice();
}

/** Intentos de hablar con un backend REAL de Firebase (Firestore, Auth,
 *  Installations, Hosting/Auth domain). Tiene que ser SIEMPRE [] en tests. */
export function getFirebaseBackendRequests(page: Page): string[] {
  return getExternalRequests(page).filter(u =>
    !/fonts\.googleapis\.com/.test(u) && !/api\.github\.com/.test(u));
}

/** PUTs a la API de contenidos de GitHub (mock) — p.ej. publicar productos.json */
export function getGithubPuts(page: Page) {
  return (netState.get(page)?.githubPuts || []).slice();
}

/** Contenido actual (mock) de un archivo del repo, decodificado */
export function getGithubFile(page: Page, path: string): string | null {
  const f = netState.get(page)?.githubFiles[path];
  return f ? Buffer.from(f.content, 'base64').toString('utf8') : null;
}

/** Helper para setear una colección de Firestore desde un test */
export async function setCollection(page: Page, name: string, docs: Record<string, any>) {
  await page.evaluate(({ n, d }) => (window as any).__firebaseMock.setCollection(n, d), { n: name, d: docs });
}

/** Helper para leer el estado actual de una colección */
export async function getCollection(page: Page, name: string) {
  return page.evaluate((n) => (window as any).__firebaseMock.getCollection(n), name);
}

/** Log de operaciones de Firestore/Auth que hizo la página (ver firebase-mock.ts) */
export async function getFirebaseLog(page: Page): Promise<any[]> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__firebaseMock.log)));
}

/** Helper: espera a que se complete cualquier animación en curso */
export async function waitAnimations(page: Page, ms = 300) {
  await page.waitForTimeout(ms);
}
