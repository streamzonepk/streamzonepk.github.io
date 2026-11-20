/* Stream Zone service worker: lets the site install as an app and open offline */
const CACHE = "sz-v1";
const CORE = ["/", "/offline.html", "/assets/css/store.css?v=2", "/assets/js/store.js?v=4", "/favicon.svg?v=2", "/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // never touch Supabase, fonts or other sites
  if (req.mode === "navigate") {                        // pages: always try the network first
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match("/offline.html"))));
    return;
  }
  if (/\.(css|js|png|svg|webp|ico|jpg|woff2?)$/.test(url.pathname)) {   // files: cached copy, refreshed in the background
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
