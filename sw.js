const VERSION = 'v2';
const CACHE = `cattorini-${VERSION}`;

/* Solo imágenes se pre-cachean — el resto se cachea on-demand */
const PRE_CACHE = [
  './img/logo.jpeg'
];

/* Páginas que NUNCA se cachean (admin / dinámicas) */
const NEVER_CACHE = [
  'portal.html',
  'pedidos.html',
  'seguimiento.html',
  'seguimiento-mayorista.html'
];

self.addEventListener('install', e => {
  /* Activa la nueva versión inmediatamente sin esperar a que cierre las pestañas */
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRE_CACHE).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(Promise.all([
    /* Limpiar caches viejos */
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )),
    /* Reclamar clientes existentes para que el SW nuevo tome control ya */
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  /* Nunca cachear páginas admin/dinámicas — siempre red directa */
  if (NEVER_CACHE.some(p => url.includes(p))) {
    return;
  }

  /* Bypass para requests que no son http/https (chrome-extension, etc) */
  if (!url.startsWith('http')) return;

  /* Solo interceptar mismo origen (evitar romper Firebase, fonts, etc) */
  const sameOrigin = new URL(url).origin === self.location.origin;
  if (!sameOrigin) return;

  /* HTML / JSON / JS / CSS → network-first con cache fallback (para offline)
     Así el usuario siempre ve la versión última cuando hay red */
  if (/\.(html|json|js|css|xml|txt)$/i.test(new URL(url).pathname) || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          /* Solo cachear respuestas exitosas */
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  /* Imágenes, fonts, etc → cache-first (raramente cambian) */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      });
    })
  );
});
