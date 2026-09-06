-- Finalize the live MalluSpices WhatsApp channel after the Meta WABA migration.
-- The phone number ID remains the same; the owning WABA is now 1721949562372129.
-- Keep the access token in Supabase secrets / managed credentials, never in migrations.
UPDATE public.whatsapp_channels
SET
  waba_id = '1721949562372129',
  phone_number_id = '935831739613016',
  display_phone_number = '+44 7521 527543',
  status = 'active',
  access_token = NULL,
  updated_at = now()
WHERE store_id = '00000000-0000-0000-0000-000000000001'
  AND display_phone_number = '+44 7521 527543';

-- Keep fresh installations deterministic as well.
INSERT INTO public.whatsapp_channels (
  store_id,
  business_name,
  display_phone_number,
  phone_number_id,
  waba_id,
  status,
  access_token
)
SELECT
  s.id,
  'Malluspices',
  '+44 7521 527543',
  '935831739613016',
  '1721949562372129',
  'active',
  NULL
FROM public.stores s
WHERE s.id = '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.whatsapp_channels wc
    WHERE wc.store_id = s.id
      AND wc.display_phone_number = '+44 7521 527543'
  );
