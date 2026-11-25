// Service Worker do Atlas Globo: cache offline do HTML (que já contém a textura Blue Marble),
// do manifest, dos ícones e dos dois arquivos do Natural Earth.
const V = 'atlas-globo-v5';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// aceita os nomes originais do Natural Earth e os nomes renomeados; o que não existir é ignorado
const DATA = [
  './ne_50m_admin_0_countries.json', './ne_50m_admin_0_countries.geojson',
  './ne_50m_populated_places.geojson', './ne_50m_populated_places.json',
  './Países.json', './Paises.json', './paises.json',
  './Cidades.geojson', './cidades.geojson', './Cidades.json'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all([...CORE, ...DATA].map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

// cache primeiro (abre na hora, mesmo sem internet) e atualiza em segundo plano quando houver rede
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(r, {ignoreSearch: true});
    const net = fetch(r).then(res => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (r.mode === 'navigate') { const i = await c.match('./index.html'); if (i) return i; }
    return new Response('Offline', {status: 503, statusText: 'Offline'});
  })());
});
