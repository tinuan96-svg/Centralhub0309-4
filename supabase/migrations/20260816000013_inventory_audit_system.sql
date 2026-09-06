-- Inventory Audit System Schema
-- Enhances central_inventory and inventory_logs to support regular stock audits

-- 1. Add auditing fields to central_inventory
ALTER TABLE public.central_inventory
ADD COLUMN IF NOT EXISTS last_audited_at timestamptz,
ADD COLUMN IF NOT EXISTS last_audited_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS audit_notes text;

-- 2. Expand inventory_logs type to include AUDIT
ALTER TABLE public.inventory_logs
DROP CONSTRAINT IF EXISTS inventory_logs_type_check;

ALTER TABLE public.inventory_logs
ADD CONSTRAINT inventory_logs_type_check
CHECK (type IN ('ORDER', 'MANUAL', 'RETURN', 'ADJUSTMENT', 'SYNC', 'AUDIT'));

-- 3. Add device info to inventory_logs if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'device_id') THEN
        ALTER TABLE public.inventory_logs ADD COLUMN device_id text;
    END IF;
END $$;

-- 4. Create an index for auditing queries
CREATE INDEX IF NOT EXISTS idx_central_inventory_last_audited ON public.central_inventory(last_audited_at);

-- 5. Add comments
COMMENT ON COLUMN public.central_inventory.last_audited_at IS 'Timestamp of the last physical stock count audit.';
COMMENT ON COLUMN public.inventory_logs.type IS 'Type of movement. Added AUDIT for physical stock checks.';
