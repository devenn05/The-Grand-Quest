const CACHE_NAME = 'novel-cache-v1';
const PRELOAD_CHAPTERS = 3; // Number of chapters to pre-cache
const CHAPTER_PREFIX = 'chapters/';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Pre-cache essential files
            return cache.addAll([
                '/',
                '/index.html',
                '/styles.css',
                '/script.js',
                // Pre-cache first few chapters
                ...Array.from({ length: PRELOAD_CHAPTERS }, (_, i) => 
                    `${CHAPTER_PREFIX}${i + 1}.txt`)
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Cache-first strategy for chapters, network-first for other files
    if (event.request.url.includes(CHAPTER_PREFIX)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request).then((response) => {
                    // Cache the chapter after fetching
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            })
        );
    } else {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request);
            })
        );
    }
});

self.addEventListener('activate', (event) => {
    // Clean up old caches
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});