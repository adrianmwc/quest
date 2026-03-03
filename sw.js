// Increment this version number (e.g., v3 to v4) every time you change 
// your CSS, JS, or add new images to the list below.
const CACHE_NAME = 'amazing-race-v4';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png',
  // --- Audio Assets ---
  './sounds/success.wav',
  './sounds/error.wav',
  './sounds/lockout.wav',
  // --- Image Assets (Add every task image filename here) ---
  './images/fountain.jpg',
  './images/statue.jpg',
  './images/library.jpg'
];

// Installation: Cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activation: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch: Serve from cache first, then network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});