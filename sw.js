// PDF Merger Service Worker - v1
const CACHE = 'pdfmerge-v1';

const PRECACHE_URLS = [
    '/pdf-merger/',
    '/pdf-merger/static/css/style.css',
    '/pdf-merger/static/js/main.js',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => {
            const networkFetch = fetch(e.request).then(response => {
                if (response.ok) {
                    caches.open(CACHE).then(c => c.put(e.request, response.clone()));
                }
                return response;
            }).catch(() => cached || new Response('', { status: 503 }));
            // Cache-first for local assets, network-first (with cache fallback) for CDN
            const isLocal = new URL(e.request.url).origin === self.location.origin;
            return isLocal ? (cached || networkFetch) : networkFetch;
        })
    );
});
