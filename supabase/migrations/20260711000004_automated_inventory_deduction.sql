-- ============================================================
-- AUTOMATED INVENTORY DEDUCTION SYSTEM
-- Objective: Automatically deduct stock for paid orders and restore for cancellations
-- ============================================================

-- 1. Ensure inventory_logs table exists for detailed audit trail
CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reference_id text,
  change integer NOT NULL,
  old_quantity integer,
  new_quantity integer,
  type text NOT NULL CHECK (type IN ('ORDER', 'MANUAL', 'RETURN', 'ADJUSTMENT', 'SYNC')),
  reason text,
  notes text,
  edited_by uuid REFERENCES auth.users(id),
  device_name text DEFAULT 'System',
  created_at timestamptz DEFAULT now()
);

-- 2. Supporting Inventory Movements Table for Enterprise Tracking
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number text,
  change_amount integer NOT NULL,
  old_stock integer,
  new_stock integer,
  action_type text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON public.inventory_movements(order_id);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view inventory movements" ON public.inventory_movements FOR SELECT TO authenticated USING (true);

-- 3. Core Automation Function
CREATE OR REPLACE FUNCTION public.handle_order_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_old_stock integer;
  v_new_stock integer;
  v_order_number text;
BEGIN
  -- GET ORDER NUMBER
  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id LOOP
      IF v_item.product_id IS NOT NULL THEN

        -- ATOMIC DEDUCTION
        UPDATE public.products
        SET stock = COALESCE(stock, 0) - v_item.quantity,
            updated_at = now()
        WHERE id = v_item.product_id
        RETURNING stock + v_item.quantity, stock INTO v_old_stock, v_new_stock;

        -- AUDIT LOG
        INSERT INTO public.inventory_movements (
          product_id, order_id, order_number, change_amount, old_stock, new_stock,
          action_type, notes
        ) VALUES (
          v_item.product_id, NEW.id, v_order_number, -v_item.quantity, v_old_stock, v_new_stock,
          'DEDUCT', 'Order Paid'
        );

      END IF;
    END LOOP;

    NEW.stock_deducted := true;

  -- CASE 2: ORDER CANCELLED/REFUNDED (Restore Stock)
  ELSIF (NEW.order_status IN ('cancelled', 'refunded') AND (OLD.order_status NOT IN ('cancelled', 'refunded')) AND NEW.stock_deducted = true) THEN

    FOR v_item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      IF v_item.product_id IS NOT NULL THEN

        UPDATE public.products
        SET stock = COALESCE(stock, 0) + v_item.quantity,
            updated_at = now()
        WHERE id = v_item.product_id
        RETURNING stock - v_item.quantity, stock INTO v_old_stock, v_new_stock;

        INSERT INTO public.inventory_movements (
          product_id, order_id, order_number, change_amount, old_stock, new_stock,
          action_type, notes
        ) VALUES (
          v_item.product_id, NEW.id, v_order_number, v_item.quantity, v_old_stock, v_new_stock,
          'RESTORE', 'Order ' || NEW.order_status
        );

      END IF;
    END LOOP;

    NEW.stock_deducted := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_inventory_movement ON public.orders;
CREATE TRIGGER trg_order_inventory_movement
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_inventory_movement();
