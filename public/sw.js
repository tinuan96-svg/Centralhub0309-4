const DEFAULT_NOTIFICATION_URL = '/dashboard';

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
  const options = {
    body: payload.body || payload.message || 'New CentralHub notification',
    icon: payload.icon || '/app-icon.svg',
    badge: payload.badge || '/app-icon.svg',
    tag: payload.tag || payload.notificationId || 'centralhub-system',
    renotify: Boolean(payload.renotify || payload.notificationId),
    data: {
      url: payload.url || payload.action_url || DEFAULT_NOTIFICATION_URL,
      notificationId: payload.notificationId || payload.id || null,
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
