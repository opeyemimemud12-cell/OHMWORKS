/* OHMWORKS Service Worker v14 — FIXED offline caching */

const VERSION='v14';
const CACHE_NAME='ohmworks-'+VERSION;

/* Same-origin files: cache normally (no CORS issues) */
const LOCAL_ASSETS=[
  './',
  './index.html',
  './manifest.json'
];

/* CDN files: cache with no-cors (opaque responses) */
const CDN_ASSETS=[
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap'
];

/* Install: cache everything we need */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        const localPromises = LOCAL_ASSETS.map(url =>
          cache.add(url).catch(() => console.log('cache miss:', url))
        );
        const cdnPromises = CDN_ASSETS.map(url =>
          fetch(url, {mode:'no-cors'})
            .then(r => cache.put(url, r))
            .catch(() => console.log('CDN cache miss:', url))
        );
        return Promise.allSettled([...localPromises, ...cdnPromises]);
      })
      .then(() => self.skipWaiting())
  );
});

/* Activate: clean old versions, claim clients */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* Fetch: serve from cache when offline */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  /* For page navigation (loading the engine): try network, fall back to cache */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE_NAME).then(c => c.put('./', copy));
          return r;
        })
        .catch(() =>
          caches.match('./')
            .then(hit => hit || caches.match('./index.html'))
            .then(hit => hit || caches.match(e.request))
        )
    );
    return;
  }

  /* For CDN assets (Three.js, fonts): cache-first */
  if (url.includes('cdn.jsdelivr.net') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request)
        .then(hit => {
          if (hit) return hit;
          return fetch(e.request).then(r => {
            const copy = r.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
            return r;
          });
        })
    );
    return;
  }

  /* For everything else (same-origin): network-first, cache fallback */
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});

/* Allow page to trigger immediate update */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
