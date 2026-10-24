// Caches the app so it opens offline, and focuses the app when a notification is tapped.
const CACHE = 'rias-v15';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'dialogue.js', 'talk.js', 'chat.js', 'food.js', 'work.js', 'ai.js', 'rias-avatar.js', 'vendor/anthropic-sdk.js', 'manifest.webmanifest',
  'living-photo.js', 'alarm-card.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'sounds/alarm_chime.ogg', 'sounds/alarm_harp.ogg', 'sounds/alarm_musicbox.ogg', 'sounds/alarm_magic.ogg', 'sounds/alarm_classic.ogg', 'sounds/alarm_pulse.ogg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so updates show up, cache as the offline fallback.
self.addEventListener('fetch', (e) => {
  // Only the app's own files; API calls (Claude, Gemini) go straight to the network.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request)
    .then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
