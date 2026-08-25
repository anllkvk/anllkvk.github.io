/**
 * NAKAVT service worker — installable + offline play.
 *
 * Strategy:
 *  - Precache the FULL app shell (index, styles, manifest, icon, and the entire
 *    ES-module graph) so the very first offline launch boots cleanly.
 *  - Navigations: network-first (fresh HTML when online) → cache fallback offline.
 *  - Other same-origin GETs: stale-while-revalidate — serve the cached copy fast,
 *    refresh the cache in the background so a new deploy is picked up on the next
 *    load without waiting on a manual cache-name bump.
 *  - Offline fallback only for navigations (never serves HTML for a JS/CSS import).
 */
const CACHE = 'nakavt-v2';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './src/main.js', './src/config.js', './src/scene.js', './src/ui.js',
  './src/core/rng.js', './src/core/events.js', './src/core/shot.js',
  './src/core/knockout.js', './src/core/ease.js',
  './src/audio/sfx.js', './src/audio/haptics.js',
  './src/render/characters.js', './src/render/arena.js', './src/render/camera.js',
  './src/render/particles.js', './src/render/sprites.js',
];

self.addEventListener('install', (e) => {
  // best-effort precache: don't fail install if one entry 404s
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(
    SHELL.map((u) => c.add(u).catch(() => null)),
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigations → network-first, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // Subresources → stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit); // offline: fall back to whatever we had (or undefined)
      return hit || network;
    }),
  );
});
