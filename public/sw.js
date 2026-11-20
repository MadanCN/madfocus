// Mad Focus service worker: makes the app installable and keeps the app shell
// (HTML, JS, CSS, icons, exercise images) available on a weak connection.
// Data from Supabase and /api is never cached: it always comes from the network.
const CACHE = 'mf-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Pages: network first, fall back to the cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return res
    }).catch(() => caches.match('/')))
    return
  }
  // Hashed build assets and images: cache first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/exercises/') || /\.(png|jpg|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
      return res
    })))
  }
})
