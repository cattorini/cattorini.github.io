/* sw.js de Cattorini — basado en el template estándar de Las Flores Software
 * (~/.claude/skills/new_client/assets/sw-template.js).
 *
 * Objetivo: que NUNCA haga falta pedirle a nadie que borre la caché.
 * - HTML, JS, CSS y JSON (precios, catálogo, horarios): siempre se piden a la
 *   red, revalidando con el servidor (cache: 'no-cache' → GitHub Pages responde
 *   304 si no cambió). La caché se usa SOLO si no hay conexión.
 * - Imágenes y fuentes: cache-first (casi nunca cambian y son lo pesado)...
 * - ...SALVO las imágenes que el portal reemplaza CON EL MISMO NOMBRE (QR de
 *   pago, logo, fotos de producción/local): esas van network-first. Si no,
 *   un cliente que ya visitó el sitio seguiría viendo el QR de pago VIEJO
 *   (y podría pagarle a una cuenta vieja). Las fotos de productos que sube el
 *   portal tienen nombre único (p{id}-{timestamp}-xxxx.ext): cache-first.
 * - Portal, cola de pedidos, seguimiento y qr NO pasan por el SW (siempre red).
 * - Al instalarse se activa enseguida (skipWaiting + clients.claim) y borra las
 *   cachés de versiones anteriores; si reemplaza un sw viejo, recarga una vez
 *   las pestañas abiertas.
 * - No toca nada de otros orígenes (CDNs, Firebase, Google Fonts).
 *
 * VERSION tiene que cambiar en cada cambio de este archivo
 * (la anterior era 'cattorini-v2').
 */
const VERSION = 'cattorini-v3';
const PRECACHE = [
  './',
  './index.html',
  './tienda.html',
  './producto.html',
  './404.html',
  './privacidad.html',
  './terminos.html',
  './arrepentimiento.html',
  './legal.css',
  './legal.js',
  './manifest.json',
  './productos.json',
  './tienda-core.js',
  './ubicaciones.js',
  './localidades-ar.json',
  './img/logo.jpeg'
];

/* Páginas que NUNCA pasan por el SW (staff / datos en vivo) */
const NUNCA_SW = /\/(portal|pedidos|seguimiento|seguimiento-mayorista|qr)\.html$/i;

/* Imágenes que el portal sobrescribe con el MISMO nombre (portal.html →
   uploadImagen): network-first, con la caché solo como respaldo offline. */
const IMG_REEMPLAZABLES = /\/img\/(qr-pago\.jpg|logo\.jpeg|fabrica\.jpg|local\.jpg|hero-local\.jpg)$/i;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION)
      // cache: 'reload' → baja la versión actual del servidor, no la de la caché HTTP.
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const viejas = (await caches.keys()).filter((k) => k !== VERSION);
    await Promise.all(viejas.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Si reemplaza una versión anterior, las pestañas abiertas muestran HTML
    // servido por el sw viejo: se recargan una vez para ver lo nuevo ya.
    if (viejas.length) {
      const ventanas = await self.clients.matchAll({ type: 'window' });
      ventanas.forEach((w) => w.navigate(w.url).catch(() => {}));
    }
  })());
});

function guardar(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copia = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copia));
  }
  return res;
}

function redPrimero(req) {
  // fetch(url, init) y no fetch(req, init): un Request de navegación no se
  // puede re-crear con opciones (tira TypeError).
  return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then((res) => guardar(req, res))
    .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NUNCA_SW.test(url.pathname)) return;

  if (IMG_REEMPLAZABLES.test(url.pathname)) {
    e.respondWith(redPrimero(req));
    return;
  }

  const esEstatico = ['image', 'font'].includes(req.destination) ||
    /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);

  if (esEstatico) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => guardar(req, res))));
    return;
  }

  e.respondWith(redPrimero(req));
});
