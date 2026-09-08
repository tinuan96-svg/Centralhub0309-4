import { createSign } from 'node:crypto';

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FirebaseSendPayload = {
  title: string;
  body: string;
  url?: string | null;
  notificationId?: string | null;
  category?: string | null;
  severity?: string | null;
  dedupeKey?: string | null;
  storeId?: string | null;
  storeSlug?: string | null;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function readServiceAccount(): FirebaseServiceAccount | null {
  const raw = (
    process.env.CENTRALHUB_FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    ''
  ).trim();

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getFirebaseMessagingConfigStatus() {
  const account = readServiceAccount();
  return {
    configured: Boolean(account),
    projectId: account?.project_id || null,
    missing: account ? [] : ['CENTRALHUB_FIREBASE_SERVICE_ACCOUNT_JSON'],
  };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(account: FirebaseServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + '.' + claim;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + '.' + base64Url(signer.sign(account.private_key.replace(/\\n/g, '\n')));

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  const json: any = await response.json().catch(() => null);
  if (!response.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || 'Firebase access-token request failed.');
  }

  cachedAccessToken = {
    token: json.access_token,
    expiresAt: now + Number(json.expires_in || 3600),
  };
  return json.access_token;
}

function dataValue(value: unknown) {
  return value === null || value === undefined ? undefined : String(value);
}

function channelFor(category?: string | null) {
  if (category === 'customer_message') return 'centralhub_customer_messages';
  if (category === 'order_received' || category === 'order_confirmed') return 'centralhub_orders';
  return 'centralhub_alerts';
}

export async function sendFirebasePush(token: string, payload: FirebaseSendPayload) {
  const account = readServiceAccount();
  if (!account) {
    return { ok: false, status: 503, error: 'Firebase service-account configuration is missing.' };
  }

  try {
    const accessToken = await getAccessToken(account);
    const data = Object.fromEntries(
      Object.entries({
        title: payload.title,
        body: payload.body,
        action_url: payload.url || '/dashboard',
        notification_id: payload.notificationId,
        category: payload.category || 'phone_push',
        severity: payload.severity || 'info',
        dedupe_key: payload.dedupeKey,
        store_id: payload.storeId,
        store_slug: payload.storeSlug,
      })
        .map(([key, value]) => [key, dataValue(value)])
        .filter(([, value]) => value !== undefined),
    );

    const notificationChannelId = channelFor(payload.category);
    const response = await fetch(
      'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(account.project_id) + '/messages:send',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + accessToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data,
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: notificationChannelId,
                priority: 'PRIORITY_HIGH',
                default_sound: true,
                default_vibrate_timings: true,
                visibility: 'PUBLIC',
                notification_count: 1,
                click_action: 'OPEN_CENTRALHUB',
              },
            },
          },
        }),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, error: responseText.slice(0, 500) };
    }

    return { ok: true, status: response.status };
  } catch (error: any) {
    return { ok: false, status: 500, error: error?.message || 'Firebase push failed.' };
  }
}
