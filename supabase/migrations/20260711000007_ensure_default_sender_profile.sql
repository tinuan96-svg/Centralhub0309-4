-- Ensure sender_profiles table exists and has a default entry
CREATE TABLE IF NOT EXISTS public.sender_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  postcode text NOT NULL,
  country text NOT NULL DEFAULT 'GB',
  phone text NOT NULL,
  email text NOT NULL,
  is_default boolean DEFAULT false,
  site text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sender_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies (if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sender_profiles' AND policyname = 'Authenticated users can view sender profiles') THEN
        CREATE POLICY "Authenticated users can view sender profiles" ON public.sender_profiles FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sender_profiles' AND policyname = 'Authenticated users can insert sender profiles') THEN
        CREATE POLICY "Authenticated users can insert sender profiles" ON public.sender_profiles FOR INSERT TO authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sender_profiles' AND policyname = 'Authenticated users can update sender profiles') THEN
        CREATE POLICY "Authenticated users can update sender profiles" ON public.sender_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Insert Default Sender Profile if none exists (Updated with Prime Grocers Details)
INSERT INTO public.sender_profiles (
  name,
  company_name,
  contact_name,
  address_line1,
  address_line2,
  city,
  postcode,
  phone,
  email,
  is_default
)
SELECT
  'Main Warehouse',
  'Prime Grocers Ltd',
  'Warehouse Manager',
  '19 Weald bridge nursery',
  'Kents Lane North weald',
  'Epping',
  'CM16 6AX',
  '+447300548838',
  'shipping@centralhub.network',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.sender_profiles WHERE is_default = true);
