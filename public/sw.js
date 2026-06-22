// Custody service worker. Conservative by design: it NEVER caches live consistency state.
// Online users always get fresh server responses; offline users get a static shell only.
// Bump VERSION to invalidate all caches on the next visit.
const VERSION = "custody-v1";
const STATIC_CACHE = VERSION + "-static";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept live data paths: always hit the network for fresh consistency state.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, fall back to a static offline page only when truly offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  // Immutable, content-hashed build assets ONLY: cache-first. Restricting to /_next/static/
  // means a hashless asset (sw.js, public files) is never served stale from cache while online.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Precached icons and the offline page: serve from cache when present, otherwise network.
  // Nothing reaching here is dynamic (live /api is handled above), so this is safe.
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});

// Let the page tell a waiting worker to take over immediately.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
