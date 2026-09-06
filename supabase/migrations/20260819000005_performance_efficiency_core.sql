-- 1. MATERIALIZED ANALYTICS SYSTEM
-- Dedicated table for super-fast dashboard loading
CREATE TABLE IF NOT EXISTS public.business_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key text UNIQUE NOT NULL, -- e.g., 'dashboard_summary', 'top_categories'
    metric_data jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- 2. SMART SLOTTING & VELOCITY TRACKING
-- Add tracking for sales velocity to support Improvement #3
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_velocity_30d numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS suggested_warehouse_location text;

-- 3. FUNCTION: RECALCULATE VELOCITY
-- Updates how fast items are moving to suggest better warehouse placement
CREATE OR REPLACE FUNCTION public.calculate_sales_velocity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.products p
    SET sales_velocity_30d = (
        SELECT COALESCE(SUM(oi.quantity), 0) / 30.0
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id
          AND o.created_at >= now() - INTERVAL '30 days'
          AND o.payment_status = 'paid'
    );
END;
$$;

-- 4. FUNCTION: AUTO-GENERATE METRICS SNAPSHOT
-- Pre-calculates dashboard data to make it load in milliseconds
CREATE OR REPLACE FUNCTION public.refresh_business_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_summary jsonb;
    v_top_cats jsonb;
BEGIN
    -- Calculate General Summary
    SELECT jsonb_build_object(
        'total_revenue', COALESCE(SUM(total), 0),
        'order_count', COUNT(*),
        'avg_order_value', CASE WHEN COUNT(*) > 0 THEN SUM(total) / COUNT(*) ELSE 0 END,
        'last_updated', now()
    ) INTO v_summary
    FROM public.orders
    WHERE payment_status = 'paid' AND created_at >= now() - INTERVAL '30 days';

    INSERT INTO public.business_metrics (metric_key, metric_data, updated_at)
    VALUES ('dashboard_summary', v_summary, now())
    ON CONFLICT (metric_key) DO UPDATE SET metric_data = EXCLUDED.metric_data, updated_at = now();

    -- Calculate Top Categories (Profit & Revenue)
    SELECT jsonb_agg(t) INTO v_top_cats
    FROM (
        SELECT
            p.category,
            SUM(oi.total_price) as revenue,
            SUM(oi.total_price - (COALESCE(oi.cost_price, 0) * oi.quantity)) as profit,
            COUNT(DISTINCT oi.order_id) as order_count
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        JOIN public.orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid'
        GROUP BY p.category
        ORDER BY revenue DESC
        LIMIT 10
    ) t;

    INSERT INTO public.business_metrics (metric_key, metric_data, updated_at)
    VALUES ('top_categories', v_top_cats, now())
    ON CONFLICT (metric_key) DO UPDATE SET metric_data = EXCLUDED.metric_data, updated_at = now();
END;
$$;
