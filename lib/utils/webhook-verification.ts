import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies HMAC signature for incoming webhooks.
 */
export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm = 'sha256'
): boolean {
  if (!secret || !signature) return false;

  const hmac = createHmac(algorithm, secret);
  const digest = Buffer.from(hmac.update(payload).digest('hex'), 'utf8');
  const checksum = Buffer.from(signature, 'utf8');

  if (checksum.length !== digest.length) {
    return false;
  }

  return timingSafeEqual(digest, checksum);
}

/**
 * Basic shared secret verification.
 */
export function verifySharedSecret(
  providedSecret: string | null,
  expectedSecret: string | undefined
): boolean {
  if (!expectedSecret || !providedSecret) return false;
  return providedSecret === expectedSecret;
}
