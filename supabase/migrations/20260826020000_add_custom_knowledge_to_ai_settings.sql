-- Add custom_knowledge field to AI Assistant settings
ALTER TABLE public.customer_care_settings
ADD COLUMN IF NOT EXISTS custom_knowledge text;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
