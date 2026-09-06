-- DASHBOARD COMMAND CENTRE CORE INFRASTRUCTURE
-- Adds tables for Business Targets, System Notifications, and General Activity Logging.

-- 1. BUSINESS TARGETS
CREATE TABLE IF NOT EXISTS public.business_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid REFERENCES public.stores(id), -- NULL = Global
    metric_key text NOT NULL, -- revenue, orders, profit, customer_growth, etc.
    target_value numeric NOT NULL,
    period_type text NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- 2. SYSTEM NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.system_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id), -- NULL = Broadcast to all staff
    store_id uuid REFERENCES public.stores(id),
    title text NOT NULL,
    message text,
    severity text DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
    category text NOT NULL, -- inventory, order, shipping, payment, sync, security, system
    action_url text, -- Link to relevant page
    is_read boolean DEFAULT false,
    read_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- 3. GENERAL ACTIVITY LOG (BROADER AUDIT)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    store_id uuid REFERENCES public.stores(id),
    entity_type text NOT NULL, -- product, order, customer, store, user, setting, system
    entity_id text,
    action text NOT NULL, -- create, update, delete, status_change, sync, login, etc.
    previous_values jsonb DEFAULT '{}'::jsonb,
    new_values jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'success', -- success, failed, warning
    ip_address text,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

-- RLS POLICIES

ALTER TABLE public.business_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Targets: Read for staff, Manage for Admins
CREATE POLICY "Staff can view business targets" ON public.business_targets
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage business targets" ON public.business_targets
    FOR ALL TO authenticated USING (public.is_admin());

-- Notifications: Read/Update for recipient (or all if NULL)
CREATE POLICY "Users can view their notifications" ON public.system_notifications
    FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Users can update their notifications" ON public.system_notifications
    FOR UPDATE TO authenticated USING (user_id IS NULL OR user_id = auth.uid());

-- Activity Logs: Read for staff, System/Trigger writes
CREATE POLICY "Staff can view activity logs" ON public.activity_logs
    FOR SELECT TO authenticated USING (true);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_targets_metric ON public.business_targets(metric_key);
CREATE INDEX IF NOT EXISTS idx_targets_dates ON public.business_targets(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.system_notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_activity_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_logs(created_at DESC);

-- COMMENT
COMMENT ON TABLE public.business_targets IS 'Performance targets configured by admins for KPIs.';
COMMENT ON TABLE public.system_notifications IS 'In-app notifications for operational events and alerts.';
COMMENT ON TABLE public.activity_logs IS 'Centralized audit trail for all significant system and user actions.';
