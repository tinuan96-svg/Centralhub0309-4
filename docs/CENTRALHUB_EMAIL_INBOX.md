# CentralHub private email inbox (read-only, manual review)
- /customer-care/email is a separate channel, leaving WhatsApp inbox unchanged.
- /api/customer-care/email-inbox requires a fresh valid Supabase session AND active, verified Super Admin. Neither a decoded client JWT nor user_metadata is trusted for authorisation.
- Anonymous/authenticated direct table reads remain denied by RLS and privileges. API returns only 100 recent rows, no HTML execution, with Cache-Control: no-store.
- GET lists private email; PATCH changes only existing email processing_state to unread/reviewed/archived. No automatic replies, sending, ticket creation, binary attachment download or attachment archive.
- Keep outgoing sending disabled until SPF TXT and return-path MX are verified and manual-send authorization is implemented.
