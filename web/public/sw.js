/*
 * ZenPort service worker — honest app-shell strategy.
 *  - Hashed build assets, the app's artwork and icons: cache-first, so the
 *    app looks whole offline.
 *  - Navigations: network-first with the cached shell as offline fallback.
 *  - /api/*: live data, never cached here - with one exception the person
 *    chose: meditations they downloaded for offline use. Those live in
 *    OFFLINE_CACHE (written by the page, see src/offline.ts) and are served
 *    from it first, online or not, with byte ranges answered here so the
 *    audio element can seek. Nothing else under /api is kept on the device.
 */
const SHELL_CACHE = 'zenport-shell-v1';
const ASSET_CACHE = 'zenport-assets-v1';
const OFFLINE_CACHE = 'zenport-offline-v1';
const KEEP = [SHELL_CACHE, ASSET_CACHE, OFFLINE_CACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add('/'))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** A downloaded file, whole or the requested byte range of it. */
async function fromDownloads(request) {
  const cache = await caches.open(OFFLINE_CACHE);
  const hit = await cache.match(request.url);
  if (!hit) return null;
  const range = request.headers.get('range');
  if (!range) return hit;
  const blob = await hit.blob();
  const size = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) {
    // A suffix range: the last N bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  if (
    url.pathname.startsWith('/api/media/track/') ||
    url.pathname.startsWith('/api/media/asset/')
  ) {
    event.respondWith(fromDownloads(event.request).then((hit) => hit || fetch(event.request)));
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // live data only

  // Hashed build files never change: cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Artwork and icons keep their names across releases: show the kept copy at
  // once (offline too) and refresh it quietly for next time.
  if (url.pathname.startsWith('/art/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        const fresh = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      }),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
  }
});
