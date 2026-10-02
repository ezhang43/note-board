// Offline copy of the published board, so it opens without internet once visited online.
// The board's data is kept offline separately, by Firebase.
// Bump the version when files without a unique name (icons, manifest) change: the new worker
// then starts a fresh copy and deletes the old ones, so returning visitors get the new files.
const CACHE = 'busyants-v2';
const SCOPE = self.registration.scope;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const wanted = (url) => url.startsWith(SCOPE) || FONT_HOSTS.includes(new URL(url).hostname);

async function save(cache, url) {
  if (await cache.match(url, { ignoreVary: true })) return;
  try {
    const res = await fetch(url);
    if (res.ok) await cache.put(url, res);
  } catch {
    // Offline or blocked: try again next visit.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SCOPE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

// The page lists the files it loaded before this worker was running.
self.addEventListener('message', (event) => {
  const urls = (event.data && event.data.cache) || [];
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.filter(wanted).map((u) => save(cache, u)))));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !wanted(req.url)) return;

  if (req.mode === 'navigate') {
    // The newest page when online (and keep it); the saved page when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((cache) => cache.put(SCOPE, copy));
          return res;
        })
        .catch(() => caches.match(SCOPE, { ignoreVary: true })),
    );
    return;
  }

  // Built files have a unique name per version, so a saved copy is always the right one.
  event.respondWith(
    // ignoreVary: the saved copy was fetched without the page's request headers.
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
