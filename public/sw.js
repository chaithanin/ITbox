/* TECHCORE service worker — minimal, privacy-safe.
 * - Caches only immutable build assets (/_next/static) cache-first.
 * - Never caches authenticated HTML; navigations are network-first with a
 *   lightweight offline fallback. Bump CACHE to invalidate old asset caches. */
const CACHE = "techcore-static-v1";
const ASSET = /\/_next\/static\//;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ออฟไลน์ / Offline</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0a1830;color:#e5edff;text-align:center;padding:24px"><div><h1 style="font-size:20px;margin:0 0 8px">ออฟไลน์ / Offline</h1><p style="opacity:.8;margin:0">ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาลองใหม่อีกครั้ง<br>No internet connection. Please try again.</p></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Immutable static assets: cache-first.
  if (ASSET.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Page navigations: network-first, offline fallback (no HTML caching).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })()
    );
  }
});
