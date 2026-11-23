// Plainfile service worker. Lets the app open offline and be installed.
// This file replaces the service worker of the earlier Notebook app, which lived at the same
// address: when the browser sees this version it installs it, and the activate step below
// deletes every older cache, including Notebook's.
//
// Network first, so a new release is picked up straight away whenever there is a connection,
// with the cached copy as the fallback. The version is filled in by the build.
const CACHE = 'plainfile-__VERSION__';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './app.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon.svg',
  ...__CHUNKS__, // filled in by the build: the code split off the main file
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) ?? (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
  );
});
