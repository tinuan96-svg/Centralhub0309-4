-- Create warehouses table
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  location text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view warehouses"
  ON public.warehouses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert warehouses"
  ON public.warehouses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update warehouses"
  ON public.warehouses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert a default warehouse if none exists
INSERT INTO public.warehouses (name, code, location)
VALUES ('Main Warehouse', 'MAIN', 'Default storage location')
ON CONFLICT (code) DO NOTHING;
