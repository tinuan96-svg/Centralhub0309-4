-- FIX WHATSAPP CHANNELS MISSING COLUMNS
-- Objective: Ensure app_secret exists for webhook signature verification.

DO $$
BEGIN
    -- 1. ADD app_secret Column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_channels' AND column_name = 'app_secret') THEN
        ALTER TABLE public.whatsapp_channels ADD COLUMN app_secret text;
    END IF;

    -- 2. Ensure access_token exists (Redundant check)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_channels' AND column_name = 'access_token') THEN
        ALTER TABLE public.whatsapp_channels ADD COLUMN access_token text;
    END IF;

END $$;

-- 3. Seed Malluspices App Secret if known (optional, placeholder for now)
-- You must manually update this in Supabase with your Meta App Secret
-- UPDATE public.whatsapp_channels SET app_secret = 'YOUR_SECRET' WHERE business_name = 'Malluspices';

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
