self.addEventListener('install', function(e){ e.waitUntil(caches.open('glowtrack-v3').then(function(cache){ return cache.addAll(['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/assets/icon-192.png', '/assets/icon-512.png']); })); });
self.addEventListener('fetch', function(e){ e.respondWith(caches.match(e.request).then(function(r){ return r || fetch(e.request); })); });
