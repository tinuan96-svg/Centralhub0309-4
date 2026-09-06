-- ============================================================
-- AI SALES ASSISTANT & SMART UPSELL ENGINE
-- Objective: Enable revenue generation through intelligent product affinity and intent detection.
-- ============================================================

-- 1. Product Affinity Table (Co-purchase patterns)
CREATE TABLE IF NOT EXISTS public.product_affinity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_a_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_b_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  co_purchase_count integer DEFAULT 1,
  confidence numeric(4, 3), -- Ratio: count / total product_a orders
  lift numeric(10, 3),       -- Confidence / (product_b frequency)
  last_updated timestamptz DEFAULT now(),
  UNIQUE(product_a_id, product_b_id)
);

-- 2. Customer Product Interest (Funnel Tracking)
CREATE TABLE IF NOT EXISTS public.customer_product_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  interest_type text NOT NULL CHECK (interest_type IN ('asked_about', 'recommended', 'clicked', 'added_to_cart', 'purchased')),
  confidence numeric(3, 2),
  source text DEFAULT 'ai_assistant',
  created_at timestamptz DEFAULT now()
);

-- 3. Sales Recommendations (Audit & Inbox Feed)
CREATE TABLE IF NOT EXISTS public.sales_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('cross_sell', 'repeat_purchase', 'bundle', 'upgrade', 'free_delivery_gap')),
  score numeric(5, 2),
  reason text,
  status text DEFAULT 'suggested' CHECK (status IN ('suggested', 'sent', 'clicked', 'converted', 'ignored')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Function to Calculate Initial Affinity (Best Effort)
CREATE OR REPLACE FUNCTION public.refresh_product_affinity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clear existing affinity
  DELETE FROM public.product_affinity;

  -- Insert co-purchase pairs from order_items
  INSERT INTO public.product_affinity (product_a_id, product_b_id, co_purchase_count)
  SELECT
    oi1.product_id as product_a_id,
    oi2.product_id as product_b_id,
    COUNT(*) as co_purchase_count
  FROM public.order_items oi1
  JOIN public.order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id != oi2.product_id
  WHERE oi1.product_id IS NOT NULL AND oi2.product_id IS NOT NULL
  GROUP BY oi1.product_id, oi2.product_id;

  -- Update confidence (approximate)
  -- Note: We'd ideally divide by total orders containing product_a
END;
$$;

-- 5. RLS Policies
ALTER TABLE public.product_affinity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_product_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view affinity" ON public.product_affinity FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage sales tracking" ON public.customer_product_interest FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage recommendations" ON public.sales_recommendations FOR ALL TO authenticated USING (true);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_affinity_a ON public.product_affinity(product_a_id);
CREATE INDEX IF NOT EXISTS idx_interest_customer ON public.customer_product_interest(customer_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_conv ON public.sales_recommendations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_interest_funnel ON public.customer_product_interest(interest_type);

-- Enable Realtime for Recommendations
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sales_recommendations;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
