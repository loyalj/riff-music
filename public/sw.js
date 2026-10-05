// Offline support. The page is network-first (so new deploys show up),
// hashed /assets/ files are cache-first, since their names change with every build.
const CACHE = 'riff-v1';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch('./', { cache: 'no-cache' });
    await cache.put('./', res.clone());
    // Cache the built JS/CSS the page references, so the very first visit works offline.
    const html = await res.text();
    const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
    await Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        (await caches.open(CACHE)).put('./', res.clone());
        return res;
      } catch {
        return (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit && url.pathname.includes('/assets/')) return hit;
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  })());
});
