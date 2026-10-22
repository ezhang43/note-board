// Offline copy of the published board, so it opens without internet once visited online.
// The board's data is kept offline separately, by Firebase.
// Bump the version when files without a unique name (icons, manifest) change: the new worker
// then starts a fresh copy and deletes the old ones, so returning visitors get the new files.
// v5: a worker from before the website pages could keep one of them as the app's offline page.
// v6: starts a fresh copy, so the built files of every past publish (never deleted before) go at once.
const CACHE = 'busyants-v6';
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

// Built files have a name per version, so each publish would add a set that the next one never uses. Saves the
// app's page; when it differs from the saved one (a new build), the saved built files of the old build go after
// it, before the page asks for its own. Fonts stay. The same page (the usual visit) deletes nothing, so files
// loaded on demand (the picture and PDF code) stay for offline use.
async function savePage(res) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(SCOPE, { ignoreVary: true });
  const changed = saved && (await saved.text()) !== (await res.clone().text());
  await cache.put(SCOPE, res);
  if (!changed) return;
  const built = new URL('assets/', SCOPE).href;
  for (const req of await cache.keys()) if (req.url.startsWith(built)) await cache.delete(req);
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
    // Only the app's own page (any ?join= link included) is kept for offline: a website page
    // (about/, faq/, terms/, privacy/) must never take its place. Those just load from the network.
    if (new URL(req.url).pathname !== new URL(SCOPE).pathname) return;
    // The newest page when online (and keep it); the saved page when offline.
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          // Saved before the page asks for its files, so a new build's page clears the old build's files first.
          // Whatever goes wrong while saving, the page itself is still the one that came from the network.
          if (res.ok) await savePage(res.clone()).catch(() => {});
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
