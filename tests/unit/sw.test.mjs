/**
 * Service worker (sw.js) — tests unitarios en Node (vm), sin navegador.
 *
 * Problema: imágenes → cache-first SIN revalidar. El portal reemplaza
 * archivos con el MISMO nombre (img/qr-pago.jpg, logo.jpeg, fabrica.jpg,
 * local.jpg, hero-local.jpg). Un cliente que ya visitó el sitio sigue viendo
 * el QR de pago VIEJO hasta que se cambie VERSION en sw.js → puede pagarle a
 * una cuenta vieja. Además el HTML "network-first" usa fetch(e.request) con
 * el caché HTTP por defecto: GitHub Pages manda max-age=600, así que un
 * deploy puede tardar hasta 10 min en verse aun con red.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://cattorini.github.io';

function cargarSW() {
  const handlers = {};
  const store = new Map(); // url -> response
  const fetchCalls = [];
  const mkResp = (tag) => ({ status: 200, type: 'basic', tag, clone() { return this; } });
  const cache = {
    put: async (req, res) => { store.set(typeof req === 'string' ? req : req.url, res); },
    match: async (req) => store.get(typeof req === 'string' ? req : req.url),
    addAll: async () => {}
  };
  const ctx = {
    self: {
      addEventListener: (t, fn) => { handlers[t] = fn; },
      location: { origin: ORIGIN },
      skipWaiting: () => {},
      clients: { claim: async () => {} }
    },
    caches: {
      open: async () => cache,
      match: async (req) => store.get(typeof req === 'string' ? req : req.url),
      keys: async () => [],
      delete: async () => true
    },
    fetch: async (req, init) => { fetchCalls.push({ req, init }); return mkResp('red'); },
    URL, console, Promise
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(resolve(root, 'sw.js'), 'utf8'), ctx);
  return { handlers, store, fetchCalls, mkResp };
}

async function disparar(sw, url, extra = {}) {
  let responded = null;
  const ev = {
    request: { url, method: 'GET', mode: extra.mode || 'no-cors', cache: extra.cache || 'default', destination: extra.destination || '' },
    respondWith: (p) => { responded = p; },
    waitUntil: () => {}
  };
  sw.handlers.fetch(ev);
  return responded ? await responded : undefined; // undefined = el SW no intercepta (va a la red)
}

const vaALaRed = (sw, url) => sw.fetchCalls.some(c => (typeof c.req === 'string' ? c.req : c.req.url) === url);

describe('sw.js', () => {
  for (const img of ['qr-pago.jpg', 'logo.jpeg', 'fabrica.jpg', 'local.jpg', 'hero-local.jpg']) {
    test(`img/${img} (reemplazable desde el portal) no se sirve de caché sin consultar la red`, async () => {
      const refs = readdirSync(root).filter(f => f.endsWith('.html'))
        .flatMap(f => readFileSync(resolve(root, f), 'utf8').match(new RegExp(`img/${img.replace('.', '\\.')}[^"'\\s)]*`, 'g')) || []);
      const todasVersionadas = refs.length > 0 && refs.every(r => /\?v=/.test(r));
      if (todasVersionadas) return; // alternativa válida: URL versionada en el HTML
      const sw = cargarSW();
      const url = `${ORIGIN}/img/${img}`;
      sw.store.set(url, sw.mkResp('VIEJA'));
      const res = await disparar(sw, url, { destination: 'image' });
      assert.ok(res === undefined || vaALaRed(sw, url),
        `img/${img} se sirvió desde caché sin revalidar (cache-first): los clientes ven la versión vieja`);
    });
  }

  test('HTML: network-first que saltea el caché HTTP (max-age=600 de GitHub Pages)', async () => {
    const sw = cargarSW();
    await disparar(sw, `${ORIGIN}/tienda.html`, { mode: 'navigate', destination: 'document' });
    const call = sw.fetchCalls[0];
    assert.ok(call, 'el HTML no fue a la red');
    const modo = (call.init && call.init.cache) || (call.req && call.req.cache);
    assert.ok(['no-cache', 'no-store', 'reload'].includes(modo),
      `fetch del HTML usa cache="${modo}" → puede devolver una versión de hasta 10 min`);
  });

  test('portal/pedidos/seguimiento nunca pasan por el caché del SW', async () => {
    for (const p of ['portal.html', 'pedidos.html', 'seguimiento.html', 'seguimiento-mayorista.html']) {
      const sw = cargarSW();
      const res = await disparar(sw, `${ORIGIN}/${p}`, { mode: 'navigate' });
      assert.equal(res, undefined, `${p} es interceptado por el SW`);
    }
  });

  test('no intercepta requests de otros orígenes (Firebase, fuentes)', async () => {
    const sw = cargarSW();
    const res = await disparar(sw, 'https://firestore.googleapis.com/v1/projects/x');
    assert.equal(res, undefined);
  });
});
