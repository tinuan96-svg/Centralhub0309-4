-- Keep MalluSpices aligned with the live Meta WhatsApp phone number ID.
-- The webhook payloads for +44 7521 527543 use 935831739613016.
UPDATE whatsapp_channels
SET phone_number_id = '935831739613016',
    updated_at = now()
WHERE store_id = '00000000-0000-0000-0000-000000000001'
  AND display_phone_number = '+44 7521 527543';
