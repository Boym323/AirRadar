const CACHE_NAME = "airradar-shell-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("airradar-shell-") && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))
    .then(() => self.clients.claim())));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  ) return;

  // Keep the worker out of Next's build/runtime asset lifecycle. In
  // particular, never substitute the HTML shell for a failed JS, CSS, RSC,
  // worker, font, or API response.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});
