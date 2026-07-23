const CACHE = 'cattorini-v1';
const STATIC = [
  './',
  './index.html',
  './tienda.html',
  './producto.html',
  './manifest.json',
  './img/logo.jpeg'
];
const JSON_FILES = ['./productos.json'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})))
);

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  /* JSON siempre network-first para ver cambios del portal */
  if (JSON_FILES.some(f => url.includes(f))) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  /* No cachear portal / pedidos (dinámicos) */
  if (url.includes('portal.html') || url.includes('pedidos.html')) {
    return;
  }
  /* Cache-first para el resto */
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
