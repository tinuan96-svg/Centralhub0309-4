const DEFAULT_NOTIFICATION_URL = '/dashboard';

const STORE_NOTIFICATION_ICONS = {
  malluspices: '/notification-logos/malluspices.svg',
  keralagrocery: '/notification-logos/keralagrocery.svg',
  pocketgrocery: '/notification-logos/pocketgrocery.svg',
  tamilretail: '/notification-logos/tamilretail.svg',
};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through for PWA installability requirements.
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      payload = {
        title: 'CentralHub',
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || 'CentralHub';
  const storeSlug = String(
    payload.storeSlug
      || payload.store_slug
      || payload.metadata?.store_slug
      || ''
  ).trim().toLowerCase();
  const storeIcon = STORE_NOTIFICATION_ICONS[storeSlug] || '/app-icon.svg';
  const options = {
    body: payload.body || payload.message || 'New CentralHub notification',
    icon: payload.icon || storeIcon,
    badge: payload.badge || storeIcon,
    tag: payload.tag || payload.notificationId || 'centralhub-system',
    // Chrome/Android controls the notification channel sound. A web push payload
    // cannot force a spoken voice or override a muted device/channel.
    silent: false,
    vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [250, 100, 250],
    requireInteraction: Boolean(payload.requireInteraction || payload.category === 'customer_message'),
    renotify: Boolean(payload.renotify || payload.notificationId),
    data: {
      url: payload.url || payload.action_url || DEFAULT_NOTIFICATION_URL,
      notificationId: payload.notificationId || payload.id || null,
      category: payload.category || null,
      storeId: payload.storeId || payload.store_id || payload.metadata?.store_id || null,
      storeName: payload.storeName || payload.store_name || payload.metadata?.store_name || null,
      storeSlug: storeSlug || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const requestedUrl = event.notification.data?.url || DEFAULT_NOTIFICATION_URL;
  const targetUrl = new URL(requestedUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin)) {
        if ('navigate' in client) {
          await client.navigate(targetUrl);
        }
        if ('focus' in client) {
          return client.focus();
        }
      }
    }

    return clients.openWindow(targetUrl);
  })());
});
