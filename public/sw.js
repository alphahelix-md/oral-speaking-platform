const CACHE = 'oral-shell-v5';
const SHELL = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(async keys => {
        const oldCaches = keys.filter(key => key.startsWith('oral-shell-') && key !== CACHE);
        await Promise.all(oldCaches.map(key => caches.delete(key)));
        await self.clients.claim();
        if (!oldCaches.length) return;
        const clients = await self.clients.matchAll({ type: 'window' });
        await Promise.all(clients.map(client => client.navigate(client.url)));
      })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('/') : undefined) || Response.error())
  );
});
