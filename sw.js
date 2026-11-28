// Service Worker do Atlas Globo: cache offline do HTML (que já contém a textura Blue Marble),
// do manifest, dos ícones e dos arquivos do Natural Earth (países 10m e cidades).
// Ao trocar o index.html ou um arquivo de dados, aumente o número da versão abaixo.
const V = 'atlas-globo-v9';   // v9: desempenho (DPR 1,25, modo rápido em gestos, LOD pré-calculado, ladrilhos com atraso). v8: renova o cache e a página busca a versão nova primeiro
const TC = 'atlas-tiles-v1';          // ladrilhos de satélite já vistos (ficam disponíveis offline)
const TILE_HOST = 'server.arcgisonline.com', TILE_MAX = 2000;
let tilePuts = 0;
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// aceita os nomes originais do Natural Earth e os nomes renomeados; o que não existir é ignorado
const DATA = [
  './Paises.json', './Países.json', './paises.json',
  './ne_10m_admin_0_countries.json', './ne_10m_admin_0_countries.geojson',
  './ne_50m_admin_0_countries.json', './ne_50m_admin_0_countries.geojson',
  './Cidades.geojson', './cidades.geojson', './Cidades.json',
  './ne_50m_populated_places.geojson', './ne_50m_populated_places.json'
];
const DATA_PATHS = new Set(DATA.map(u => new URL(u, self.registration.scope).pathname));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all([...CORE, ...DATA].map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V && k !== TC) await caches.delete(k);
    await self.clients.claim();
  })());
});

// A página (index.html) busca a rede primeiro (até 4 s) e só usa o cache se estiver sem internet ou lento: assim atualizações chegam na hora.
// Os demais arquivos: cache primeiro (abre na hora, mesmo sem internet).
// Páginas e ícones atualizam em segundo plano quando há rede; os arquivos de dados (o Paises.json de 10m
// tem ~24 MB) ficam só no cache e não são baixados de novo a cada abertura.
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method === 'GET' && u.hostname === TILE_HOST) {
    // ladrilhos de satélite: cache primeiro; o que vier da rede é guardado (limite de ~2000 ladrilhos)
    e.respondWith((async () => {
      const c = await caches.open(TC);
      const hit = await c.match(r);
      if (hit) return hit;
      try {
        const res = await fetch(r);
        if (res && res.ok && res.status === 200) {
          c.put(r, res.clone()).catch(() => {});
          if (++tilePuts % 50 === 0) {
            const ks = await c.keys();
            if (ks.length > TILE_MAX) for (const k of ks.slice(0, ks.length - TILE_MAX + 200)) await c.delete(k);
          }
        }
        return res;
      } catch (_) { return Response.error(); }
    })());
    return;
  }
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(V);
    if (r.mode === 'navigate' || u.pathname.endsWith('/index.html')) {
      try {
        const res = await Promise.race([fetch(r), new Promise((_, no) => setTimeout(no, 4000))]);
        if (res && res.ok && res.status === 200) { c.put(r, res.clone()).catch(() => {}); return res; }
      } catch (_) {}
      const old = (await c.match(r, {ignoreSearch: true})) || (await c.match('./index.html'));
      if (old) return old;
    }
    const hit = await c.match(r, {ignoreSearch: true});
    const heavy = DATA_PATHS.has(u.pathname);
    if (hit && heavy) return hit;
    const net = fetch(r).then(res => { if (res && res.ok && res.status === 200) c.put(r, res.clone()).catch(() => {}); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (r.mode === 'navigate') { const i = await c.match('./index.html'); if (i) return i; }
    return new Response('Offline', {status: 503, statusText: 'Offline'});
  })());
});
