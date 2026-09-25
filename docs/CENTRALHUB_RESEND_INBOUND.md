# CentralHub Resend inbound (no automatic replies)
The domain centralhub.network receives on five explicit addresses. The inbound Edge Function handles Resend account-wide webhooks but ignores other domains and all other recipients after authenticating each callback.

Deployment checklist:
1. Apply migration `20260925060000_centralhub_resend_inbound.sql` in the existing CentralHub Supabase project only.
2. Deploy `centralhub-resend-inbound` with `verify_jwt=false` because Resend supplies a signed external webhook (the handler verifies the signature).
3. In CentralHub Supabase Edge Function Secrets, configure `CENTRALHUB_RESEND_API_KEY` (Resend API key with receiving read permissions) and `CENTRALHUB_RESEND_WEBHOOK_SECRET` (copy directly from Resend webhook details). Never add secrets to GitHub or chat.
4. Only after step 3, register Resend account-wide `email.received` webhook at `https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/centralhub-resend-inbound`. Account-wide webhooks can include MalluSpices: the handler authenticates and ignores non-CentralHub recipients.
5. Test from a separately confirmed sender into support@centralhub.network; verify exactly one row in public.centralhub_resend_inbound; replay and confirm deduplication. Use Resend receiving API for attachment binary retrieval before claiming that attachments are archived.
6. Outgoing Resend sending must remain off until DKIM/SPF/MX are verified and the user explicitly confirms a sender address for testing. No automated replies or ticket updates.
Notes: The table is private via RLS plus grants. Email body is plaintext only; attachment metadata is stored, not binaries. No customer-facing inbox is released by this migration. Existing messages and tickets are untouched.
