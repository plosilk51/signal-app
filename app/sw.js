// Signal's offline helper (a "service worker").
//
// It runs in the background on the phone and sits between the app and the internet:
//   - Online: always fetch the newest app and feed first, and keep a copy.
//   - Offline, blocked, or very slow (over 4 seconds): use the stored copy instead,
//     so the app still opens with the last feed rather than a blank screen.
// Photos from news sites aren't stored (they're large and belong to other sites).

const CACHE = "signal-v1";            // change this name to throw away old copies
const NETWORK_TIMEOUT_MS = 4000;

// Stored as soon as the helper is installed, so the app can open offline.
const APP_FILES = [
  "./", "index.html", "style.css", "app.js", "manifest.json", "feed.json",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-512.png", "icons/favicon-32.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();                 // start working right away
});

self.addEventListener("activate", event => {
  // Remove copies kept under older names.
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Fetch from the network, but give up after NETWORK_TIMEOUT_MS.
function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS);
    fetch(request).then(
      response => { clearTimeout(timer); resolve(response); },
      problem => { clearTimeout(timer); reject(problem); },
    );
  });
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const ours = url.origin === self.location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (event.request.method !== "GET" || !(ours || fonts)) return;   // leave everything else alone

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // The app asks for "feed.json" fresh each time; store and look it up without that detail.
    const key = ours ? url.origin + url.pathname : event.request;
    try {
      const response = await fetchWithTimeout(event.request);
      if (response.ok) cache.put(key, response.clone());
      return response;
    } catch (problem) {
      const stored = await cache.match(key, { ignoreSearch: true });
      if (!stored) throw problem;
      if (url.pathname.endsWith("/feed.json")) {
        // Tell the app this feed came from the stored copy, so it can say so.
        const headers = new Headers(stored.headers);
        headers.set("X-Signal-Offline", "1");
        return new Response(await stored.blob(), { status: 200, headers });
      }
      return stored;
    }
  })());
});
