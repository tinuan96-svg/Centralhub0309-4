import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

/**
 * CentralHub Resend inbound adapter.
 * Account-wide Resend webhooks may include other stores: discard non-CentralHub recipients.
 * Fail closed if webhook secret or read-only receiving credentials are absent.
 * No email is sent, no AI instructions are followed, and no tickets are auto-created.
 */
const ALLOWED = new Set([
  "support@centralhub.network",
  "admin@centralhub.network",
  "info@centralhub.network",
  "notifications@centralhub.network",
  "nora@centralhub.network",
]);
const MAX_BODY = 1024 * 1024;
const response = (status: number, detail: string) =>
  new Response(JSON.stringify({ status: detail }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function decodeBase64(input: string): Uint8Array {
  const decoded = atob(input.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}
function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}
async function verifiedWebhook(req: Request, raw: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const stamp = req.headers.get("svix-timestamp");
  const header = req.headers.get("svix-signature");
  if (!id || !stamp || !header || !/^[0-9]+$/.test(stamp) || !secret.startsWith("whsec_")) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(stamp)) > 300) return false;
  const keyBytes = decodeBase64(secret.slice(6));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = new TextEncoder().encode(id + "." + stamp + "." + raw);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return header.split(" ").some((part) => {
    if (!part.startsWith("v1,")) return false;
    try { return constantTimeEqual(expected, decodeBase64(part.slice(3))); }
    catch { return false; }
  });
}
function plainAddress(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.match(/<([^<>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}
function targetAddresses(value: unknown): string[] {
  return Array.isArray(value) ? value.map(plainAddress).filter((address) => ALLOWED.has(address)) : [];
}
function adminKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof keys.default === "string" ? keys.default : "";
  } catch { return ""; }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, "method_not_allowed");
  const secret = Deno.env.get("CENTRALHUB_RESEND_WEBHOOK_SECRET");
  const apiKey = Deno.env.get("CENTRALHUB_RESEND_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = adminKey();
  if (!secret || !apiKey || !url || !serviceKey) return response(503, "integration_not_configured");

  let raw: string;
  try {
    if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return response(413, "payload_too_large");
    raw = await req.text();
    if (raw.length > MAX_BODY) return response(413, "payload_too_large");
    if (!(await verifiedWebhook(req, raw, secret))) return response(401, "invalid_signature");
  } catch { return response(401, "invalid_signature"); }

  let event: Record<string, any>;
  try { event = JSON.parse(raw); }
  catch { return response(400, "invalid_event"); }
  if (event.type !== "email.received") return response(200, "ignored_event");
  const details = event.data;
  const targets = targetAddresses(details?.to);
  // This Resend account is shared with other stores; never capture their messages.
  if (targets.length === 0) return response(200, "ignored_recipient");
  const id = details?.email_id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(id)) return response(400, "invalid_email_id");

  // Fetch body via authenticated receiving API: email.received webhook holds only metadata.
  let email: Record<string, any>;
  try {
    const result = await fetch("https://api.resend.com/emails/receiving/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) return response(503, "email_fetch_failed");
    email = await result.json();
    if (!email || typeof email !== "object") return response(503, "email_fetch_failed");
  } catch { return response(503, "email_fetch_failed"); }

  // Never allow an untrusted email's HTML to execute in CentralHub.
  // Attachment IDs/metadata are preserved; binary files are NOT stored by this adapter.
  const text = typeof email.text === "string" ? email.text.slice(0, 500000) : null;
  const attachments = Array.isArray(details.attachments)
    ? details.attachments.slice(0, 100).map((attachment: Record<string, unknown>) => ({
        id: String(attachment?.id || "").slice(0, 256),
        filename: String(attachment?.filename || "").slice(0, 512),
        content_type: String(attachment?.content_type || "").slice(0, 128),
      }))
    : [];
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.from("centralhub_resend_inbound").insert({
    resend_email_id: id,
    message_id: String(email.message_id || details.message_id || "").slice(0, 512) || null,
    from_address: plainAddress(email.from || details.from).slice(0, 320),
    to_addresses: targets,
    subject: String(email.subject || details.subject || "").slice(0, 998),
    body_text: text,
    attachments,
    received_at: typeof details.created_at === "string" && !Number.isNaN(Date.parse(details.created_at))
      ? details.created_at : new Date().toISOString(),
  });
  if (error && error.code !== "23505") {
    console.error("CentralHub inbound store failed:", error.code);
    return response(503, "email_store_failed");
  }
  return response(200, error ? "already_received" : "stored_for_review");
});
