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
// Main app routes - Network First with aggressive timeout
registerRoute(
  ({ request }) => request.mode === 'navigate',
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

// HTML files - Network First with short timeout
registerRoute(
  /\.html$/,
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
});

// Take control of all clients immediately when the service worker activates
self.addEventListener('activate', (event) => {
  event.waitUntil(clientsClaim());
});
