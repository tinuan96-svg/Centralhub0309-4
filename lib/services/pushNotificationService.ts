import { supabase } from '@/lib/supabase';

declare global {
  interface Window {
    CentralHubNative?: {
      getFcmToken: () => string;
      getPlatform: () => string;
      getAppId: () => string;
    };
  }
}

export interface PushBrowserStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasPublicKey: boolean;
  serviceWorkerReady: boolean;
  subscribed: boolean;
  serverSubscriptions: number;
  webSupported: boolean;
  webSubscribed: boolean;
  webServerSubscriptions: number;
  nativeSupported: boolean;
  nativeSubscribed: boolean;
  nativeServerSubscriptions: number;
  provider: 'web' | 'native' | 'hybrid' | 'none';
  endpoint?: string;
  error?: string;
}

const VAPID_PUBLIC_KEY = (
  process.env.NEXT_PUBLIC_CENTRALHUB_VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  ''
).trim();
const NATIVE_API_BASE = (
  process.env.NEXT_PUBLIC_CENTRALHUB_API_URL ||
  'https://centralhub.network'
).replace(/\/+$/, '');

function isNativeAndroid(): boolean {
  return typeof window !== 'undefined' && Boolean(window.CentralHubNative?.getFcmToken);
}

function isSupportedBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function getPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
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

async function getNativeFcmToken() {
  if (!isNativeAndroid()) return null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = window.CentralHubNative?.getFcmToken()?.trim();
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  return null;
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

async function readServerSubscriptionCounts(): Promise<{ web: number; native: number }> {
  const token = await getAccessToken();
  const headers = { Authorization: 'Bearer ' + token };
  const [webResponse, nativeResponse] = await Promise.all([
    fetch('/api/push/subscribe', { headers }).catch(() => null),
    fetch('/api/push/native', { headers }).catch(() => null),
  ]);

  const [webJson, nativeJson] = await Promise.all([
    webResponse?.json().catch(() => null) || null,
    nativeResponse?.json().catch(() => null) || null,
  ]);

  return {
    web: Number(webJson?.count ?? 0),
    native: Number(nativeJson?.count ?? 0),
  };
}

async function readServerSubscriptionCountsSafely(): Promise<{ web: number; native: number }> {
  try {
    return await readServerSubscriptionCounts();
  } catch {
    return { web: 0, native: 0 };
  }
}

export const PushNotificationService = {
  async registerNativeDevice() {
    const nativeToken = await getNativeFcmToken();
    if (!nativeToken) return { supported: false, registered: false };

    const accessToken = await getAccessToken();
    const response = await fetch(NATIVE_API_BASE + '/api/push/native', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: nativeToken,
        platform: window.CentralHubNative?.getPlatform?.() || 'android',
        appId: window.CentralHubNative?.getAppId?.() || 'com.centralhub.network',
        deviceName: navigator.userAgent.slice(0, 160),
      }),
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || 'Could not register this Android device.');
    }

    return { supported: true, registered: true, id: json.id };
  },

  async getStatus(): Promise<PushBrowserStatus> {
    const webSupported = isSupportedBrowser();
    const nativeSupported = isNativeAndroid();
    const permission = getPermissionStatus();

    if (!webSupported && !nativeSupported) {
      return {
        supported: false,
        permission,
        hasPublicKey: Boolean(VAPID_PUBLIC_KEY),
        serviceWorkerReady: false,
        subscribed: false,
        serverSubscriptions: 0,
        webSupported: false,
        webSubscribed: false,
        webServerSubscriptions: 0,
        nativeSupported: false,
        nativeSubscribed: false,
        nativeServerSubscriptions: 0,
        provider: 'none',
      };
    }

    try {
      const registration = webSupported ? await navigator.serviceWorker.getRegistration('/sw.js') : null;
      const subscription = await registration?.pushManager.getSubscription();
      const serverCounts = await readServerSubscriptionCountsSafely();
      const nativeSubscribed = nativeSupported && serverCounts.native > 0;
      const webSubscribed = Boolean(subscription);
      const provider = webSubscribed && nativeSubscribed
        ? 'hybrid'
        : nativeSubscribed ? 'native' : webSubscribed ? 'web' : nativeSupported ? 'native' : 'web';

      return {
        supported: true,
        permission,
        hasPublicKey: Boolean(VAPID_PUBLIC_KEY),
        serviceWorkerReady: Boolean(registration),
        subscribed: webSubscribed || nativeSubscribed,
        serverSubscriptions: serverCounts.web + serverCounts.native,
        webSupported,
        webSubscribed,
        webServerSubscriptions: serverCounts.web,
        nativeSupported,
        nativeSubscribed,
        nativeServerSubscriptions: serverCounts.native,
        provider,
        endpoint: subscription?.endpoint,
      };
    } catch (error: any) {
      return {
        supported: true,
        permission,
        hasPublicKey: Boolean(VAPID_PUBLIC_KEY),
        serviceWorkerReady: false,
        subscribed: false,
        serverSubscriptions: 0,
        webSupported,
        webSubscribed: false,
        webServerSubscriptions: 0,
        nativeSupported,
        nativeSubscribed: false,
        nativeServerSubscriptions: 0,
        provider: nativeSupported ? 'native' : webSupported ? 'web' : 'none',
        error: error?.message || 'Could not read push status.',
      };
    }
  },

  async enable(): Promise<PushBrowserStatus> {
    let nativeRegistered = false;
    if (isNativeAndroid()) {
      const nativeResult = await this.registerNativeDevice();
      nativeRegistered = Boolean(nativeResult.registered);
    }

    if (!isSupportedBrowser()) {
      if (nativeRegistered) return this.getStatus();
      throw new Error('This device does not expose a supported phone notification provider yet.');
    }

    if (!VAPID_PUBLIC_KEY) {
      if (nativeRegistered) return this.getStatus();
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
        Authorization: 'Bearer ' + token,
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
        Authorization: 'Bearer ' + token,
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
