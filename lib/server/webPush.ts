import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from 'crypto';

export interface StoredPushSubscription {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body?: string;
  message?: string;
  url?: string;
  action_url?: string;
  tag?: string;
  notificationId?: string;
  id?: string;
  renotify?: boolean;
  [key: string]: unknown;
}

export interface WebPushSendResult {
  ok: boolean;
  status: number;
  statusText: string;
  responseText?: string;
}

function base64UrlEncode(input: Buffer | Uint8Array | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value: string): Buffer {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer | string, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, typeof info === 'string' ? Buffer.from(info) : info, length));
}

function getVapidPublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_CENTRALHUB_VAPID_PUBLIC_KEY ||
    process.env.CENTRALHUB_VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    ''
  ).trim();
}

function getVapidPrivateKey(): string {
  return (
    process.env.CENTRALHUB_VAPID_PRIVATE_KEY ||
    process.env.VAPID_PRIVATE_KEY ||
    ''
  ).trim();
}

function getVapidSubject(): string {
  return (
    process.env.CENTRALHUB_VAPID_SUBJECT ||
    process.env.VAPID_SUBJECT ||
    'mailto:admin@centralhub.network'
  ).trim();
}

export function getWebPushConfigStatus() {
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();
  const subject = getVapidSubject();
  const missing: string[] = [];

  if (!publicKey) missing.push('NEXT_PUBLIC_CENTRALHUB_VAPID_PUBLIC_KEY');
  if (!privateKey) missing.push('CENTRALHUB_VAPID_PRIVATE_KEY');
  if (!subject) missing.push('CENTRALHUB_VAPID_SUBJECT');

  return {
    configured: missing.length === 0,
    missing,
    subject,
  };
}

function createVapidPrivateKey(publicKey: string, privateKey: string) {
  const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n');

  if (normalizedPrivateKey.includes('BEGIN')) {
    return createPrivateKey(normalizedPrivateKey);
  }

  const publicRaw = base64UrlDecode(publicKey);
  const privateRaw = base64UrlDecode(privateKey);

  if (publicRaw.length !== 65 || publicRaw[0] !== 4) {
    throw new Error('VAPID public key must be an uncompressed P-256 public key.');
  }

  if (privateRaw.length !== 32) {
    throw new Error('VAPID private key must be a 32-byte base64url value or PEM private key.');
  }

  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(publicRaw.subarray(1, 33)),
      y: base64UrlEncode(publicRaw.subarray(33, 65)),
      d: base64UrlEncode(privateRaw),
    },
    format: 'jwk',
  });
}

function createVapidJwt(endpoint: string): { token: string; publicKey: string } {
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();
  const subject = getVapidSubject();
  const status = getWebPushConfigStatus();

  if (!status.configured) {
    throw new Error(`Web Push is not configured. Missing: ${status.missing.join(', ')}`);
  }

  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = createVapidPrivateKey(publicKey, privateKey);
  const signature = sign('sha256', Buffer.from(unsignedToken), {
    key,
    dsaEncoding: 'ieee-p1363',
  });

  return {
    token: `${unsignedToken}.${base64UrlEncode(signature)}`,
    publicKey,
  };
}

function encryptPayload(subscription: StoredPushSubscription, payload: WebPushPayload): Buffer {
  const receiverPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);

  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 4) {
    throw new Error('Invalid push subscription public key.');
  }

  const sender = createECDH('prime256v1');
  const senderPublicKey = sender.generateKeys();
  const sharedSecret = sender.computeSecret(receiverPublicKey);
  const context = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    receiverPublicKey,
    senderPublicKey,
  ]);
  const ikm = hkdf(authSecret, sharedSecret, context, 32);
  const salt = randomBytes(16);
  const cek = hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);

  const plaintext = Buffer.concat([
    Buffer.from(JSON.stringify(payload)),
    Buffer.from([0x02]),
  ]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublicKey.length]),
    senderPublicKey,
    encrypted,
  ]);
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: WebPushPayload,
  options: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {},
): Promise<WebPushSendResult> {
  const encryptedBody = encryptPayload(subscription, payload);
  const vapid = createVapidJwt(subscription.endpoint);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(options.ttl ?? 60 * 60),
      Urgency: options.urgency ?? 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`,
    },
    body: encryptedBody as unknown as BodyInit,
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    responseText: response.ok ? undefined : await response.text().catch(() => undefined),
  };
}
