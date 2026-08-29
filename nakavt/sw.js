/**
 * NAKAVT service worker — installable + offline, but always fresh when online.
 *
 * Strategy: NETWORK-FIRST for same-origin GETs (so a new deploy is picked up on
 * the very next online load — no stale code), falling back to the cache when
 * offline. The full app shell is precached so the first offline launch still
 * boots. Bump CACHE on any shipped change to force a clean refresh.
 */
const CACHE = 'nakavt-v6';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './src/main.js', './src/config.js', './src/scene.js', './src/ui.js',
  './src/core/rng.js', './src/core/events.js', './src/core/shot.js',
  './src/core/knockout.js', './src/core/ease.js', './src/core/score.js',
  './src/audio/sfx.js', './src/audio/haptics.js',
  './src/render/characters.js', './src/render/arena.js', './src/render/camera.js',
  './src/render/particles.js', './src/render/sprites.js',
];

self.addEventListener('install', (e) => {
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
  // Network-first: freshest code when online, cache fallback when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(
      (hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined),
    )),
  );
});
