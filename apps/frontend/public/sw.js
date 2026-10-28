// Sakdulur's offline copy: trees, people and photos opened while online stay readable without internet.
// Registered on the app pages by src/lib/offline.ts. Online, everything comes from the network (and the copy is
// updated); offline, the last copy answers. Editing needs the network (see src/lib/api/client.ts).
//
// Bump VERSION when the caching rules change: older caches are then deleted.
const VERSION = "4";
const STATIC = `sakdulur-static-v${VERSION}`;
const PAGES = `sakdulur-pages-v${VERSION}`;
const DATA = `sakdulur-data-v${VERSION}`;
const PHOTOS = `sakdulur-photos-v${VERSION}`;
const CACHES = [STATIC, PAGES, DATA, PHOTOS];

const NETWORK_WAIT_MS = 4000; // then answer from the copy, if there is one
const MAX_STATIC = 600;
const MAX_PHOTOS = 600;
const PHOTO_HOSTS = ["res.cloudinary.com"];
const SAVED_AT = "X-Sakdulur-Saved-At";
const LAST_PAGE = "/__sakdulur/last-tree-page";
const WARM_EVERY_MS = 10 * 60_000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("sakdulur-") && !CACHES.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// {type: "clear"}: signed out (or another account signed in), so nothing of this account stays on the device.
// {type: "warm", urls}: app pages the user is on (and the tree's other tabs). Moving between tabs fetches only
// parts of a page, never the whole page, so without this a tab visited that way had no copy for offline use.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm" && Array.isArray(event.data.urls)) {
    event.waitUntil(warm(event.data.urls));
  }
  if (event.data && event.data.type === "clear") {
    event.waitUntil(
      Promise.all(CACHES.map((name) => caches.delete(name))).then(() => event.source && event.source.postMessage({ type: "cleared" })),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (req.method !== "GET") {
    // Saving needs the network; say so clearly instead of a bare network error.
    if (sameOrigin && url.pathname.startsWith("/api/proxy/")) event.respondWith(fetch(req).catch(() => offlineJson()));
    return;
  }
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req, STATIC, MAX_STATIC));
  if ((sameOrigin && url.pathname.startsWith("/uploads/")) || PHOTO_HOSTS.includes(url.hostname)) {
    return event.respondWith(photo(req));
  }
  if (!sameOrigin) return;
  if (url.pathname.startsWith("/api/proxy/")) return event.respondWith(networkFirst(req, DATA, req.url));
  // Moving between pages fetches only page parts (RSC). Offline, answer with a plain error: Next.js then loads the
  // whole page instead (it waits forever on a failed fetch), and that page load is answered from the copy below.
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    return event.respondWith(fetch(req).catch(() => new Response("", { status: 503, headers: { "X-Sakdulur-Offline": "" } })));
  }
  // Page loads of the app.
  if (req.mode === "navigate" && (url.pathname === "/app" || url.pathname.startsWith("/app/"))) {
    return event.respondWith(page(req, url));
  }
});

/** The network, but at most NETWORK_WAIT_MS when a copy exists; keeps the copy up to date. */
async function networkFirst(req, cacheName, key) {
  const cache = await caches.open(cacheName);
  const network = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic" && !res.redirected) await cache.put(key, await stamped(res.clone()));
    return res;
  });
  network.catch(() => {}); // when the copy answered first, a later network failure is expected
  const copy = await cache.match(key);
  try {
    if (!copy) return await network;
    return await Promise.race([network, wait(NETWORK_WAIT_MS).then(() => fromCopy(copy))]);
  } catch {
    if (copy) return fromCopy(copy);
    throw new TypeError("offline");
  }
}

async function page(req, url) {
  const key = url.origin + url.pathname; // ?client=... from the apps' launcher doesn't make another page
  try {
    const res = await networkFirst(req, PAGES, key);
    if (url.pathname.startsWith("/app/t/") && !res.headers.has("X-Sakdulur-Offline")) {
      const cache = await caches.open(PAGES);
      await cache.put(LAST_PAGE, new Response(url.pathname));
    }
    return res;
  } catch {
    // Not opened before: /app (the apps' start page) goes to the tree that was open last; anything else gets the
    // offline page.
    const cache = await caches.open(PAGES);
    const last = url.pathname.replace(/\/$/, "") === "/app" ? await cache.match(LAST_PAGE) : undefined;
    if (last) {
      const path = await last.text();
      if (path !== url.pathname && (await cache.match(url.origin + path))) return Response.redirect(path, 302);
    }
    return offlinePage();
  }
}

async function warm(urls) {
  const cache = await caches.open(PAGES);
  for (const [i, raw] of urls.entries()) {
    const url = new URL(raw, self.location.origin);
    if (url.origin !== self.location.origin || !(url.pathname === "/app" || url.pathname.startsWith("/app/"))) continue;
    const key = url.origin + url.pathname;
    const hit = await cache.match(key);
    if (hit && Date.now() - Date.parse(hit.headers.get(SAVED_AT) || "0") < WARM_EVERY_MS) continue;
    try {
      const res = await fetch(key, { credentials: "same-origin", headers: { Accept: "text/html" } });
      const html = (res.headers.get("Content-Type") || "").includes("text/html");
      if (res.ok && res.type === "basic" && !res.redirected && html) {
        // The page's own code too: a page saved this way was never shown, so its scripts aren't saved yet.
        await saveAssets(await res.clone().text());
        await cache.put(key, await stamped(res));
        if (i === 0 && url.pathname.startsWith("/app/t/")) await cache.put(LAST_PAGE, new Response(url.pathname));
      }
    } catch {
      return; // offline: nothing to warm
    }
  }
}

/** Saves the /_next/static files a page refers to (scripts, styles, fonts) that aren't saved yet. */
async function saveAssets(html) {
  const cache = await caches.open(STATIC);
  const paths = new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) || []);
  for (const path of paths) {
    const url = new URL(path, self.location.origin).href;
    if (await cache.match(url)) continue;
    try {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch {
      return;
    }
  }
  trim(cache, MAX_STATIC);
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    trim(cache, max);
  }
  return res;
}

/** Photos: kept after the first view. Fetched with CORS so the copy is a real response (not an opaque one). */
async function photo(req) {
  const cache = await caches.open(PHOTOS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      await cache.put(req.url, res.clone());
      trim(cache, MAX_PHOTOS);
    }
    return res;
  } catch {
    return fetch(req); // no CORS on that host, or offline: the browser's own handling (the avatar falls back to initials)
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

async function stamped(res) {
  const headers = new Headers(res.headers);
  headers.set(SAVED_AT, new Date().toISOString());
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

/** The copy, marked so the page can say "offline, data from <time>". */
function fromCopy(copy) {
  const headers = new Headers(copy.headers);
  headers.set("X-Sakdulur-Offline", copy.headers.get(SAVED_AT) || "");
  return new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function offlineJson() {
  return new Response(JSON.stringify({ status: 503, message: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json", "X-Sakdulur-Offline": "" },
  });
}

function offlinePage() {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sakdulur · Offline</title><style>
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#f9f6ef;color:#3a3128;font:16px/1.5 system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
@media (prefers-color-scheme:dark){body{background:#221d18;color:#efe9df}p{color:#b9ad9f}}
h1{font-size:22px;margin:0 0 8px}p{max-width:360px;margin:0 auto 6px;color:#75695c}button{margin-top:18px;border:0;border-radius:10px;background:#3f7a52;color:#fff;font:inherit;padding:10px 20px}
</style></head><body><main>
<h1>Anda sedang offline</h1><p>Halaman ini belum pernah dibuka di perangkat ini. Buka pohon keluarga sekali saat online agar bisa dilihat tanpa internet.</p>
<p lang="en">You're offline. Open a family tree once while online to view it without internet.</p>
<button onclick="location.reload()">Coba lagi</button></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
