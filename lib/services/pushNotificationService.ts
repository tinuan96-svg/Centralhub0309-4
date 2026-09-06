import { supabase } from '@/lib/supabase';

export interface PushBrowserStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasPublicKey: boolean;
  serviceWorkerReady: boolean;
  subscribed: boolean;
  serverSubscriptions: number;
  endpoint?: string;
  error?: string;
}

const VAPID_PUBLIC_KEY = (
  process.env.NEXT_PUBLIC_CENTRALHUB_VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  ''
).trim();

function isSupportedBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (error || !token) {
    throw new Error('Please sign in again before enabling phone notifications.');
  }

  return token;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  if (!isSupportedBrowser()) {
    throw new Error('This browser does not support PWA push notifications.');
  }

  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;

  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

async function readServerSubscriptionCount(): Promise<number> {
  try {
    const token = await getAccessToken();
    const response = await fetch('/api/push/subscribe', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const json = await response.json().catch(() => null);
    return Number(json?.count ?? 0);
  } catch {
    return 0;
  }
}

export const PushNotificationService = {
  async getStatus(): Promise<PushBrowserStatus> {
    if (!isSupportedBrowser()) {
      return {
        supported: false,
        permission: 'unsupported',
        hasPublicKey: Boolean(VAPID_PUBLIC_KEY),
        serviceWorkerReady: false,
        subscribed: false,
        serverSubscriptions: 0,
      };
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      const serverSubscriptions = await readServerSubscriptionCount();

      return {
        supported: true,
        permission: Notification.permission,
        hasPublicKey: Boolean(VAPID_PUBLIC_KEY),
        serviceWorkerReady: Boolean(registration),
        subscribed: Boolean(subscription),
        serverSubscriptions,
        endpoint: subscription?.endpoint,
      };
    } catch (error: any) {
      return {
        supported: true,
        permission: Notification.permission,
        hasPublicKey: Boolean(VAPID_PUBLIC_KEY),
        serviceWorkerReady: false,
        subscribed: false,
        serverSubscriptions: 0,
        error: error?.message || 'Could not read push status.',
      };
    }
  },

  async enable(): Promise<PushBrowserStatus> {
    if (!VAPID_PUBLIC_KEY) {
      throw new Error('CentralHub VAPID public key is missing from the deployment environment.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Phone notification permission was not granted on this device.');
    }

    const registration = await getRegistration();
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const token = await getAccessToken();
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
        platform: 'centralhub-pwa',
      }),
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || 'Could not save this phone notification subscription.');
    }

    return this.getStatus();
  },

  async disable(): Promise<PushBrowserStatus> {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
    return this.getStatus();
  },

  async sendTestNotification() {
    const token = await getAccessToken();
    const response = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.success) {
      throw new Error(json?.error || 'Could not send test phone notification.');
    }

    return json;
  },
};
