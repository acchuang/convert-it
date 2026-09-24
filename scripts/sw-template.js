/* Service worker. scripts/build-sw.mjs fills in the __PLACEHOLDERS__ at
 * postbuild and writes out/sw.js, so the precache list always matches the
 * build it ships with.
 *
 * Strategy:
 *  - Install: precache the app shell (home and About pages, their JS/CSS,
 *    manifest, icons). Enough to open and use the app offline.
 *  - Hashed /_next/static/*: cache-first (content-hashed, never changes).
 *  - /wasm, /fonts, /icons: stale-while-revalidate, cached on first use, so a
 *    conversion that worked once keeps working offline without a first visit
 *    downloading 20 MB of engines the person may never use.
 *  - FFmpeg core (versioned CDN URL): cache-first. The app still checks its
 *    SHA-256 on every load, so a cached copy gets the same integrity check.
 *  - Navigations: network-first; offline, the cached page, or a redirect to
 *    the home converter for pages never visited.
 *  - "offline-pack" message: caches everything, for people who want the whole
 *    app offline (Footer's "Save for offline use").
 *
 * A new version waits until every tab of the old one is closed instead of
 * taking over mid-conversion (no skipWaiting).
 */

const VERSION = __VERSION__;
const SHELL = __SHELL__;
const PACK = __PACK__;
const MEDIA_ORIGIN = __MEDIA_ORIGIN__;

const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = 'assets';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('shell-') && name !== SHELL_CACHE) await caches.delete(name);
      }
      // Hashed chunks from older builds are dead weight once this one is live.
      const live = new Set(PACK);
      const assets = await caches.open(ASSET_CACHE);
      for (const request of await assets.keys()) {
        const url = new URL(request.url);
        if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
          if (!live.has(url.pathname)) await assets.delete(request);
        }
      }
      await self.clients.claim();
    })(),
  );
});

async function put(cacheName, request, response) {
  if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return put(ASSET_CACHE, request, await fetch(request));
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => put(ASSET_CACHE, request, response))
    .catch(() => cached);
  return cached ?? network;
}

async function networkFirst(request, cacheName) {
  try {
    return await put(cacheName, request, await fetch(request));
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function navigate(request) {
  try {
    return await put(SHELL_CACHE, request, await fetch(request));
  } catch {
    const url = new URL(request.url);
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ??
      (await caches.match(url.pathname.replace(/\/$/, '') || '/'));
    if (cached) return cached;
    // A converter page never opened online: the home page is the same
    // converter, so send the visitor there rather than to an error page.
    return Response.redirect('/', 302);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') return event.respondWith(navigate(request));
    if (url.pathname.startsWith('/_next/static/')) return event.respondWith(cacheFirst(request));
    if (/^\/(wasm|fonts|icons)\//.test(url.pathname) || url.pathname === '/manifest.json') {
      return event.respondWith(staleWhileRevalidate(request));
    }
    // RSC payloads for client-side navigation (/about.txt?_rsc=…).
    if (url.pathname.endsWith('.txt')) return event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (MEDIA_ORIGIN && url.origin === MEDIA_ORIGIN) event.respondWith(cacheFirst(request));
});

// Offline pack: fetch every app asset not cached yet, reporting progress.
self.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (!port) return;
  if (event.data === 'offline-pack-status') {
    event.waitUntil(
      missing().then((left) => port.postMessage({ total: PACK.length, left: left.length })),
    );
  }
  if (event.data === 'offline-pack') {
    event.waitUntil(
      (async () => {
        const left = await missing();
        const cache = await caches.open(ASSET_CACHE);
        let done = PACK.length - left.length;
        for (const path of left) {
          try {
            await cache.add(path);
          } catch {
            port.postMessage({ error: path });
            return;
          }
          done++;
          port.postMessage({ total: PACK.length, done });
        }
        port.postMessage({ total: PACK.length, done: PACK.length, complete: true });
      })(),
    );
  }
});

async function missing() {
  const left = [];
  for (const path of PACK) {
    if (!(await caches.match(path))) left.push(path);
  }
  return left;
}
