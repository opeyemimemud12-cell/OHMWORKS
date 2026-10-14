/* OHMWORKS Service Worker v14b — FIXED: CORS caching for modules */

const VERSION='v14b';
const CACHE_NAME='ohmworks-'+VERSION;

const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const FONT_URL='https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap';

/* Install: cache everything.
   CRITICAL FIX: CDN assets are fetched with normal CORS mode (NOT no-cors).
   Opaque responses cannot be used by dynamic import() — that's what broke it. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        const jobs = [
          cache.add('./').catch(()=>console.log('miss ./')),
          cache.add('./index.html').catch(()=>console.log('miss index')),
          cache.add('./manifest.json').catch(()=>console.log('miss manifest')),
          fetch(THREE_URL)
            .then(r => cache.put(THREE_URL, r))
            .catch(()=>console.log('miss three')),
          fetch(FONT_URL)
            .then(r => cache.put(FONT_URL, r))
            .catch(()=>console.log('miss fonts'))
        ];
        return Promise.allSettled(jobs);
      })
      .then(() => self.skipWaiting())
  );
});

/* Activate: delete the old poisoned cache, take control */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Fetch handler */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  /* Page navigation: network first, cache fallback for offline */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          return r;
        })
        .catch(() =>
          caches.match('./index.html')
            .then(hit => hit || caches.match('./'))
            .then(hit => hit || caches.match(e.request))
            .then(hit => hit || Response.error())
        )
    );
    return;
  }

  /* Three.js module + fonts + font files: cache-first */
  if (url.includes('cdn.jsdelivr.net') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(hit => {
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

  /* Everything else (same-origin): network first, cache fallback */
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

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
