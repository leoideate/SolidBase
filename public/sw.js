// App-shell service worker: makes the app installable and caches static assets only.
// It never caches pages or API responses and never queues clock events offline (ARD: online only).
const CACHE = "sa-static-v1";
const OFFLINE_HTML =
  '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
  '<body style="font-family:system-ui;padding:2rem;background:#f1f5f9;color:#0f172a">' +
  "<h1>No connection</h1><p>Site Attendance needs an internet connection. Nothing was recorded. " +
  "Reconnect and try again; any shift you already started is still open.</p></body>";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icons/icon-192.png", "/icons/icon-512.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "content-type": "text/html" } })));
  }
});
