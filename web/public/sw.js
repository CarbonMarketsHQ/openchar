/* Offline shell for the field app (R-8W08-0). Network-first with a cache
   fallback: every successful same-origin GET is cached, so a reload with no
   connectivity replays the last good page and its assets. */
const CACHE = 'dmrv-field-v1'

self.addEventListener('install', (e) => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(req)
        if (hit) return hit
        if (req.mode === 'navigate') {
          const shell = await caches.match('/field')
          if (shell) return shell
        }
        return Response.error()
      })
  )
})
