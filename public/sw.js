/* Pitaka service worker: keeps the app itself (HTML, JS, icons) available offline.
 *
 * - Pages: network first, so an online user always gets the latest deploy; the
 *   cached copy is used only when the network fails.
 * - /_expo/static/*: file names change with every build, so the cached copy is
 *   always correct (cache first).
 * - Other same-origin files: served from cache, refreshed in the background.
 * - Anything on another origin (Back4App data, price APIs) is never touched:
 *   the app's own Local Datastore and sync handle data offline.
 *
 * scripts/web-precache.js fills in VERSION and PRECACHE (every built file) after
 * each `expo export`, so a new deploy installs a new worker with the new files.
 */
const VERSION = 'dev';
const PRECACHE = [];
const SHELL = `pitaka-shell-${VERSION}`;
const STATIC = `pitaka-static-${VERSION}`;
const MAX_STATIC = 400;


self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // The page itself, then every file of this build (all screens' code, fonts, icons).
      await (await caches.open(SHELL)).add(new Request('/', { cache: 'reload' }));
      await (await caches.open(STATIC)).addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, STATIC]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App pages (every route is the same single-page app).
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) (await caches.open(SHELL)).put('/', fresh.clone());
          return fresh;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Versioned build output: cache first.
  if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) {
          (await caches.open(STATIC)).put(request, fresh.clone());
          trim(STATIC, MAX_STATIC);
        }
        return fresh;
      })(),
    );
    return;
  }

  // Everything else on this site (icons, fonts, images): cached, refreshed in the background.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request)
        .then(async (fresh) => {
          if (fresh.ok) (await caches.open(STATIC)).put(request, fresh.clone());
          return fresh;
        })
        .catch(() => cached || Response.error());
      return cached || refresh;
    })(),
  );
});
