const CACHE = 'ladepark-v1';
const ASSETS = ['./', './index.html', './styles.css', './src/ui.js', './src/engine.js', './src/store.js', './src/charts.js', './src/export.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
