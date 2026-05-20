import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache all static assets
precacheAndRoute(self.__WB_MANIFEST);

// Clean up outdated caches
cleanupOutdatedCaches();

// Runtime caching strategies
// Main app routes - Network First (GET only).
// Previously the matcher was `request.mode === 'navigate'` with no method
// filter, which matched non-GET navigations (e.g. OAuth callback POSTs)
// and would serve a previous user's HTML from cache on slow networks.
// Restricting to GET avoids that footgun.
registerRoute(
  ({ request }) => request.method === 'GET' && request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'app-pages-cache',
    networkTimeoutSeconds: 2,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
      })
    ]
  })
);

// HTML files - Network First with short timeout (GET only).
registerRoute(
  ({ url, request }) => request.method === 'GET' && /\.html$/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'html-cache',
    networkTimeoutSeconds: 2,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 1 // 1 day
      })
    ]
  })
);

// Static assets (JS/CSS) - Network First with medium timeout
registerRoute(
  /\.(?:js|css)$/,
  new NetworkFirst({
    cacheName: 'static-resources',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
      })
    ]
  })
);

// Images - StaleWhileRevalidate for better UX
registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  new StaleWhileRevalidate({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
      })
    ]
  })
);

// External fonts - Cache First (these rarely change)
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365 // 365 days
      })
    ]
  })
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365 // 365 days
      })
    ]
  })
);

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
  }
  // On sign-out the renderer posts CLEAR_AUTH_CACHES so we drop the
  // runtime caches that hold HTML / static-resource entries for the
  // previous session. Workbox's cleanupOutdatedCaches() only cleans
  // precache buckets; runtime caches survived sign-outs and could serve
  // the previous user's UI shell on next sign-in.
  if (event.data && event.data.type === 'CLEAR_AUTH_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) =>
              ['app-pages-cache', 'html-cache', 'static-resources'].includes(k)
            )
            .map((k) => caches.delete(k))
        )
      )
    );
  }
});

// Take control of all clients immediately when the service worker activates
self.addEventListener('activate', (event) => {
  event.waitUntil(clientsClaim());
});
