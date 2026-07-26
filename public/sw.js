// Olive service worker — handles push notifications and light offline shell.
const CACHE = 'olive-shell-v1'
const SHELL = ['/olive_wordmark.png', '/olive_icon_192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only handle GETs to our origin, and only for known static assets
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (!/\.(png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname)) return
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const clone = res.clone()
      caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {})
      return res
    }).catch(() => cached))
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { title: 'Olive', body: event.data ? event.data.text() : '' } }
  const title = data.title || 'Olive'
  const options = {
    body: data.body || '',
    icon: '/olive_icon_192.png',
    badge: '/olive_icon_192.png',
    tag: data.tag || 'olive',
    renotify: true,
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          return client.navigate(target)
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
