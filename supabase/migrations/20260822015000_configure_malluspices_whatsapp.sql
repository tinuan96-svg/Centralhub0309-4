-- Configure Malluspices WhatsApp Channel
-- Stage 3: Channel Seeding and Extra Indexes

-- 1. Seed Malluspices Channel
-- We use a DO block to prevent errors if re-run, matching by display_phone_number
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM whatsapp_channels WHERE display_phone_number = '+44 7521 527543') THEN
        INSERT INTO whatsapp_channels (
            business_name,
            display_phone_number,
            phone_number_id,
            waba_id,
            status
        ) VALUES (
            'Malluspices',
            '+44 7521 527543',
            '935831739613016',
            '865819289750231',
            'active'
        );
    END IF;
END $$;

-- 2. Performance and Idempotency Indexes (Stage 3 refinements)
-- Most were added in Stage 1, but we ensure these are present for messaging logic.

-- Index for status filtering in messages
CREATE INDEX IF NOT EXISTS idx_wa_msg_status ON whatsapp_messages(status);

-- Index for phone number searches in contacts
CREATE INDEX IF NOT EXISTS idx_wa_contacts_phone_search ON whatsapp_contacts(phone_number);

-- Index for active conversation lookups
CREATE INDEX IF NOT EXISTS idx_wa_conv_active ON whatsapp_conversations(contact_id, status) WHERE status != 'closed';

-- Index for created_at sorting
CREATE INDEX IF NOT EXISTS idx_wa_msg_created_desc ON whatsapp_messages(created_at DESC);
