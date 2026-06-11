// Service Worker for Boby-s-World Asset Caching
const CACHE_NAME = 'boby-world-assets-v2';

const ASSETS_TO_CACHE = [
    // Textures
    '/textures/ez-tree/bark/pine_normal_1k.jpg',
    '/textures/ez-tree/bark/pine_color_1k.jpg',
    '/textures/ez-tree/bark/oak_roughness_1k.jpg',
    '/textures/ez-tree/bark/willow_ao_1k.jpg',
    '/textures/ez-tree/bark/pine_roughness_1k.jpg',
    '/textures/ez-tree/bark/oak_color_1k.jpg',
    '/textures/ez-tree/bark/birch_normal_1k.jpg',
    '/textures/ez-tree/bark/willow_roughness_1k.jpg',
    '/textures/ez-tree/bark/oak_ao_1k.jpg',
    '/textures/ez-tree/bark/willow_normal_1k.jpg',
    '/textures/ez-tree/bark/willow_color_1k.jpg',
    '/textures/ez-tree/bark/birch_color_1k.jpg',
    '/textures/ez-tree/bark/birch_roughness_1k.jpg',
    '/textures/ez-tree/bark/pine_ao_1k.jpg',
    '/textures/ez-tree/bark/oak_normal_1k.jpg',
    '/textures/ez-tree/bark/birch_ao_1k.jpg',
    '/textures/ez-tree/leaves/aspen_color.png',
    '/textures/ez-tree/leaves/pine_color.png',
    '/textures/ez-tree/leaves/oak_color.png',
    '/textures/ez-tree/leaves/ash_color.png',
    '/textures/ground/grass.jpg',
    '/textures/ground/dirt_color.jpg',
    '/textures/ground/dirt_normal.jpg',
    // Large HDR textures are handled by InitialAssetPreloader and stored in IndexedDB
    // to avoid Service Worker cache limits and memory pressure.


    // Models
    '/models/coin.glb',
    '/models/dog.glb',
    '/models/grass.glb',
    '/models/flower_blue.glb',
    '/models/flower_white.glb',
    '/models/flower_yellow.glb',
    '/models/rock1.glb',
    '/models/rock2.glb',
    '/models/rock3.glb',
    '/models/Water-bottle.glb',

    // Libs (WebGL, Draco)
    '/libs/draco/draco_decoder.js',
    '/libs/draco/draco_decoder.wasm',
    '/libs/draco/draco_encoder.js',
    '/libs/draco/draco_wasm_wrapper.js',

    // Audio
    '/audio/bird-sounds.mp3',
    '/audio/Boby_On_the_Run_open_world_bg_sound.mp3',
    '/audio/Boby_On_the_Run_road_run_bg_sound.mp3',
    '/audio/coin_collect.mp3',
    '/audio/Coins fly_Shield up_Speed burst.mp3',
    '/audio/Coins fly_Shield up.mp3',
    '/audio/Coins fly_Speed burst.mp3',
    '/audio/Run_Bobby_start _to_main_menu.mp3',
    '/audio/Shield up_Speed burst.mp3',
];

// Install event - cache all critical assets
self.addEventListener('install', event => {
      console.log('[SW] Installing Service Worker');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching assets:', ASSETS_TO_CACHE.length);
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => {
            console.log('[SW] Assets cached successfully');
            return self.skipWaiting();
        }).catch(error => {
            console.error('[SW] Asset caching failed:', error);
        })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    console.log('[SW] Service Worker activating');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Service Worker ready to serve');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Only cache GET requests for game assets
    if (event.request.method !== 'GET') return;

    const isLargeAsset = url.includes('.hdr') || url.includes('.glb') && (url.includes('fox') || url.includes('wolf'));

    // Check if it's a game asset we want to cache
    const isGameAsset = (event.request.destination === 'image' ||
        event.request.destination === 'audio' ||
        url.includes('/textures/') ||
        url.includes('/models/') ||
        url.includes('/libs/') ||
        ASSETS_TO_CACHE.some(asset => url.includes(asset))) && !isLargeAsset;

    if (isGameAsset) {
        // Strip query params for cache matching
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(response => {
                const urlObj = new URL(url);
                const bypassCache = urlObj.searchParams.get('bypassCache') === 'true';

                // If in cache and NO bypass requested -> Cache First (no background fetch!)
                if (response && !bypassCache) {
                    console.log('[SW] Serving from cache:', url);
                    return response;
                }

                // Otherwise, fetch from network (Network-First or Cache-Miss)
                return fetch(event.request).then(fetchResponse => {
                    if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
                        return fetchResponse;
                    }
                    // Cache the new response
                    const responseClone = fetchResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(url.split('?')[0], responseClone);
                    });
                    return fetchResponse;
                }).catch(error => {
                    console.error('[SW] Fetch failed:', error);
                    // Fallback to cache if bypass failed
                    if (response) {
                        return response;
                    }
                    throw error;
                });
            })
        );
    }
});


// Message event - for cache updates or clearing
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[SW] Cache cleared');
            if (event.ports && event.ports[0]) event.ports[0].postMessage({ status: 'cache-cleared' });
        });
    } else if (event.data && event.data.type === 'CLEAR_ASSET_CACHE') {
        caches.open(CACHE_NAME).then(cache => {
            const url = new URL(event.data.url, self.location.origin).toString();
            // Delete matching requests ignoring search params
            cache.delete(url, { ignoreSearch: true }).then((deleted) => {
                console.log('[SW] Cleared specific asset cache:', url, deleted);
            });
        });
    }
});

