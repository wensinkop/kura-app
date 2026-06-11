// Smara service worker — minimal app-shell cache for PWA installability + basic
// offline fallback. Kept intentionally simple for Chunk 0; can be upgraded to a
// Workbox/precaching strategy in a later chunk if richer offline support is needed.

const CACHE = 'smara-shell-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only handle same-origin GET requests; let everything else (Supabase API,
  // POSTs, etc.) hit the network untouched.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return
  }

  // Navigation requests: network-first, fall back to cached shell when offline
  // (so the installed app still opens). This is an SPA, so any route resolves
  // to index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Other GETs (assets): cache-first, then network, caching successful responses.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    })
  )
})
