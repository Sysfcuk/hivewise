// Offline support: network first (so updates show straight away), cached copy when offline.
const CACHE = 'hivewise-v3';
const CORE = ['./', './index.html', './main.js', './engine.js', './ai.worker.js', './scene.js', './models.js', './hivewise.wasm',
  './vendor/three/build/three.module.js', './vendor/three/examples/jsm/environments/RoomEnvironment.js', './vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
});
