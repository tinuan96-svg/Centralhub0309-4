/**
 * Normalizes a phone number to E.164 format (best effort)
 * for consistent customer identification.
 */
export function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // 1. Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');

  // 2. Handle UK numbers (most common in this app)
  if (cleaned.startsWith('07') && cleaned.length === 11) {
    // UK local mobile -> international
    cleaned = '44' + cleaned.substring(1);
  } else if (cleaned.startsWith('7') && cleaned.length === 10) {
    // UK mobile without leading 0 -> international
    cleaned = '44' + cleaned;
  }

  // 3. Ensure no leading plus (standardized to just digits for matching)
  // or decide if you want the plus. E.164 usually has a plus.
  // We'll use a plus for "canonical" E.164
  return '+' + cleaned;
}

/**
 * Strips formatting for comparison when using ilike or simple contains
 */
export function stripPhoneFormatting(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, '');
}
