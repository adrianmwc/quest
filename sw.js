// 1. Update the version name whenever you change files (e.g., v1 to v2)
const CACHE_NAME = 'race-v2';

// 2. List every single file the iPad needs to work without Wi-Fi
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png',
  './sounds/success.wav',
  './sounds/error.wav',
  './sounds/lockout.wav'
];

// 3. Installation: Save files into the "digital backpack" (Cache)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Installing new cache...');
      return cache.addAll(ASSETS);
    })
  );
  // Force the new service worker to take over immediately
  self.skipWaiting();
});

// 4. Activation: Delete the OLD cache (v1) so it doesn't take up space
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 5. Fetch: Intercept requests and serve from the backpack instead of the web
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return the cached file, or try the network if it's not in the backpack
      return response || fetch(event.request);
    })
  );
});