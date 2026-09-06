-- Mirrors production migration 20260906215018: repair_inventory_approval_and_store_activity_guards

ALTER TABLE public.products
  ALTER COLUMN approval_status SET DEFAULT 'pending',
  ALTER COLUMN is_published SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_product_approval_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(NEW.approval_status, 'pending') <> 'approved' THEN
    NEW.is_published := false;
    NEW.approved_at := NULL;
  ELSIF TG_OP = 'INSERT' AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
  ELSIF TG_OP = 'UPDATE'
        AND OLD.approval_status IS DISTINCT FROM NEW.approval_status
        AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_product_approval_gate ON public.products;
CREATE TRIGGER trg_enforce_product_approval_gate
BEFORE INSERT OR UPDATE OF approval_status, is_published ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_product_approval_gate();

CREATE OR REPLACE FUNCTION public.compute_product_is_active(p public.products)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT
    coalesce(p.price, 0) > 0
    AND (coalesce(p.allow_backorder, false) OR coalesce(p.backorder, false) OR coalesce(p.stock, 0) > 0)
    AND (nullif(btrim(coalesce(p.brand, '')), '') IS NOT NULL OR p.brand_id IS NOT NULL)
    AND nullif(btrim(coalesce(p.sku, '')), '') IS NOT NULL
    AND nullif(btrim(coalesce(p.centralhub_product_id, '')), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores s
      LEFT JOIN public.store_product_visibility spv
        ON spv.store_id = s.id AND spv.product_id = p.id
      WHERE coalesce(spv.is_visible, true)
    );
$function$;

CREATE OR REPLACE FUNCTION public.refresh_master_product_active_from_store_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_product_id uuid;
  v_active boolean;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_product_id := OLD.product_id;
    IF v_product_id IS NOT NULL THEN
      SELECT public.compute_product_is_active(p) INTO v_active FROM public.products p WHERE p.id = v_product_id;
      UPDATE public.products p SET is_active = v_active, updated_at = now()
      WHERE p.id = v_product_id AND p.is_active IS DISTINCT FROM v_active;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_product_id := NEW.product_id;
    IF v_product_id IS NOT NULL
       AND (TG_OP <> 'UPDATE' OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.is_visible IS DISTINCT FROM OLD.is_visible) THEN
      SELECT public.compute_product_is_active(p) INTO v_active FROM public.products p WHERE p.id = v_product_id;
      UPDATE public.products p SET is_active = v_active, updated_at = now()
      WHERE p.id = v_product_id AND p.is_active IS DISTINCT FROM v_active;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_master_product_active_from_store_visibility ON public.store_product_visibility;
CREATE TRIGGER trg_refresh_master_product_active_from_store_visibility
AFTER INSERT OR DELETE OR UPDATE OF product_id, store_id, is_visible ON public.store_product_visibility
FOR EACH ROW EXECUTE FUNCTION public.refresh_master_product_active_from_store_visibility();

CREATE OR REPLACE FUNCTION public.reduce_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  item jsonb;
  new_item jsonb;
  new_items jsonb := '[]'::jsonb;
  should_deduct boolean := false;
  any_backorder boolean := false;
  v_stock integer;
  v_backorder boolean;
  v_track_stock boolean;
  v_qty integer;
  v_backorder_qty integer;
  v_variant_id uuid;
  v_product_id uuid;
  v_variant_product_id uuid;
  v_name text;
  v_used integer;
BEGIN
  IF coalesce(NEW.stock_deducted, false) THEN RETURN NEW; END IF;
  should_deduct := coalesce(NEW.payment_status, 'pending') = 'paid'
    AND coalesce(NEW.order_status, 'pending') NOT IN ('pending_payment', 'cancelled', 'refunded', 'failed', 'returned');
  IF NOT should_deduct OR NEW.items IS NULL OR jsonb_array_length(NEW.items) = 0 THEN RETURN NEW; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) LOOP
    v_qty := greatest(coalesce((item->>'quantity')::int, 0), 0);
    v_name := coalesce(item->>'name', 'Product');
    v_backorder_qty := 0;
    v_used := 0;
    v_variant_id := NULLIF(item->>'variant_id', '')::uuid;
    v_product_id := NULLIF(item->>'product_id', '')::uuid;
    v_variant_product_id := NULL;

    IF v_qty <= 0 THEN
      new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
      CONTINUE;
    END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT pv.stock, pv.product_id,
             coalesce(p.allow_backorder, false) OR coalesce(p.backorder, false),
             coalesce(p.enable_stock_tracking, true)
      INTO v_stock, v_variant_product_id, v_backorder, v_track_stock
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id
      FOR UPDATE OF pv;
      IF NOT FOUND THEN RAISE EXCEPTION 'Product variant not found for "%"', v_name; END IF;
      IF v_product_id IS NOT NULL AND v_product_id IS DISTINCT FROM v_variant_product_id THEN
        RAISE EXCEPTION 'Variant/product mismatch for "%"', v_name;
      END IF;
      v_product_id := v_variant_product_id;

      IF NOT v_track_stock THEN
        new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
        CONTINUE;
      END IF;

      v_stock := greatest(coalesce(v_stock, 0), 0);
      v_used := least(v_stock, v_qty);
      IF NOT v_backorder AND v_stock < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for "%": requested %, available %', v_name, v_qty, v_stock;
      END IF;
      v_backorder_qty := CASE WHEN v_backorder THEN greatest(v_qty - v_stock, 0) ELSE 0 END;
      UPDATE public.product_variants SET stock = greatest(0, stock - v_used), updated_at = now() WHERE id = v_variant_id;

    ELSIF v_product_id IS NOT NULL THEN
      SELECT p.stock,
             coalesce(p.allow_backorder, false) OR coalesce(p.backorder, false),
             coalesce(p.enable_stock_tracking, true)
      INTO v_stock, v_backorder, v_track_stock
      FROM public.products p WHERE p.id = v_product_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Product not found for "%"', v_name; END IF;

      IF NOT v_track_stock THEN
        new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
        CONTINUE;
      END IF;

      v_stock := greatest(coalesce(v_stock, 0), 0);
      v_used := least(v_stock, v_qty);
      IF NOT v_backorder AND v_stock < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for "%": requested %, available %', v_name, v_qty, v_stock;
      END IF;
      v_backorder_qty := CASE WHEN v_backorder THEN greatest(v_qty - v_stock, 0) ELSE 0 END;
      UPDATE public.products SET stock = greatest(0, stock - v_used), updated_at = now() WHERE id = v_product_id;
    ELSE
      new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
      CONTINUE;
    END IF;

    any_backorder := any_backorder OR v_backorder_qty > 0;
    new_item := item || jsonb_build_object('is_backorder', v_backorder_qty > 0, 'backorder_quantity', v_backorder_qty, 'physical_stock_used', v_used);
    new_items := new_items || jsonb_build_array(new_item);
  END LOOP;

  NEW.items := new_items;
  NEW.has_backorder_items := any_backorder;
  NEW.is_backorder := any_backorder;
  NEW.backorder_status := CASE WHEN any_backorder THEN 'pending' ELSE NULL END;
  NEW.stock_deducted := true;
  NEW.inventory_sync_status := CASE WHEN any_backorder THEN 'partial' ELSE 'synced' END;
  NEW.inventory_synced_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_order_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  x jsonb;
  pid uuid;
  vid uuid;
  variant_pid uuid;
  used integer;
  old_stock integer;
  new_stock integer;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR NEW.order_status NOT IN ('cancelled', 'refunded')
     OR OLD.order_status IN ('cancelled', 'refunded')
     OR coalesce(OLD.stock_deducted, false) = false THEN RETURN NEW; END IF;

  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(OLD.items, '[]'::jsonb)) LOOP
    pid := NULLIF(x->>'product_id', '')::uuid;
    vid := NULLIF(x->>'variant_id', '')::uuid;
    used := greatest(coalesce((x->>'physical_stock_used')::int, 0), 0);
    IF used <= 0 THEN CONTINUE; END IF;

    IF vid IS NOT NULL THEN
      SELECT pv.stock, pv.product_id INTO old_stock, variant_pid
      FROM public.product_variants pv WHERE pv.id = vid FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      UPDATE public.product_variants SET stock = old_stock + used, updated_at = now() WHERE id = vid;
      new_stock := old_stock + used;
      pid := coalesce(pid, variant_pid);
      IF pid IS NOT NULL THEN
        INSERT INTO public.inventory_movements(product_id, order_id, order_number, change_amount, old_stock, new_stock, action_type, notes)
        VALUES (pid, NEW.id, NEW.order_number, used, old_stock, new_stock, 'RESTORE',
          'Cancelled/refunded order: restore variant physical stock actually used (variant ' || vid::text || ')');
      END IF;
    ELSIF pid IS NOT NULL THEN
      SELECT stock INTO old_stock FROM public.products WHERE id = pid FOR UPDATE;
      IF old_stock IS NULL THEN CONTINUE; END IF;
      UPDATE public.products SET stock = old_stock + used, updated_at = now() WHERE id = pid;
      new_stock := old_stock + used;
      INSERT INTO public.inventory_movements(product_id, order_id, order_number, change_amount, old_stock, new_stock, action_type, notes)
      VALUES (pid, NEW.id, NEW.order_number, used, old_stock, new_stock, 'RESTORE',
        'Cancelled/refunded order: restore physical stock actually used');
    END IF;
  END LOOP;

  UPDATE public.backorder_items SET status = 'cancelled', updated_at = now()
  WHERE order_id = NEW.id AND status IN ('pending', 'partial');
  NEW.stock_deducted := false;
  NEW.inventory_sync_status := 'synced';
  NEW.inventory_synced_at := now();
  RETURN NEW;
END;
$function$;
