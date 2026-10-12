const C = 'ink-swing-v10';
const A = ['./', 'index.html', 'style.css', 'game.js', 'manifest.webmanifest', 'fonts/ArchivoBlack-latin.woff2', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  ...['splat-yt', 'pad', 'splash', 'drip1', 'drip2', 'chime', 'boost', 'swish', 'silence'].map(n => `sfx/${n}.wav`)];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || r.headers.has('range')) return; // let media range requests hit the network
  const u = new URL(r.url), fresh = r.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(u.pathname) || u.pathname.endsWith('/');
  if (fresh) e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
  else e.respondWith(caches.match(r).then(m => m || fetch(r)));
});
