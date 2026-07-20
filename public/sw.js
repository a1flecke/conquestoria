const CACHE_NAME = 'conquestoria-dev';

const PRECACHE_URLS = [
  '/conquestoria/',
  '/conquestoria/index.html',
  '/conquestoria/manifest.json',
  // era-1 war layer pre-cached so war music is always available offline
  '/conquestoria/audio/war/era1-war.ogg',
  // era-1 adaptive layers — unrest/defeat music available offline from turn 1
  '/conquestoria/audio/adaptive/era1-unrest.ogg',
  '/conquestoria/audio/adaptive/era1-defeat.ogg',
  // stingers — small (16–116 KB each), needed for core game events
  '/conquestoria/audio/stinger/city-founded.ogg',
  '/conquestoria/audio/stinger/war-declared.ogg',
  '/conquestoria/audio/stinger/peace-signed.ogg',
  '/conquestoria/audio/stinger/wonder-built.ogg',
  '/conquestoria/audio/stinger/tech-researched.ogg',
  '/conquestoria/audio/stinger/civ-defeated.ogg',
  '/conquestoria/audio/stinger/victory.ogg',
  '/conquestoria/audio/stinger/defeat.ogg',
  '/conquestoria/audio/stinger/era1-transition-cue.ogg',
  '/conquestoria/audio/stinger/era1-advance.ogg',
  // #594 MR7: religion/famine stingers, precached per user decision (era 3+ content
  // but small files, same curation reasoning as the era-1 stingers above).
  '/conquestoria/audio/stinger/religion/founded.ogg',
  '/conquestoria/audio/stinger/religion/city-converted.ogg',
  '/conquestoria/audio/stinger/religion/preach.ogg',
  '/conquestoria/audio/stinger/religion/loyalty-warning.ogg',
  '/conquestoria/audio/stinger/religion/city-defected.ogg',
  '/conquestoria/audio/stinger/famine/onset.ogg',
  '/conquestoria/audio/stinger/famine/resolved.ogg',
  // Era 13 network feedback: short, local, viewer-gated stingers.
  '/conquestoria/audio/stinger/network/constructive-resolution.ogg',
  '/conquestoria/audio/stinger/network/hostile-warning.ogg',
  '/conquestoria/audio/stinger/network/hostile-consequence.ogg',
  '/conquestoria/audio/stinger/network/surge.ogg',
  '/conquestoria/audio/stinger/network/recovery.ogg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy for all requests
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cached, but also update cache in background
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(() => {});

        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
