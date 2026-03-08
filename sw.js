const CACHE_NAME = 'race-v15';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './tasks.js',
  './manifest.json',
  './images/icon-192.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => {
    if(k !== CACHE_NAME) return caches.delete(k);
  }))));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});