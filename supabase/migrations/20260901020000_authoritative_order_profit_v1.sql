-- Authoritative order profitability calculation.
-- Uses order_items + current product COGS and keeps variable costs separate from operating expenses.
CREATE OR REPLACE FUNCTION public.recalculate_order_profitability(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_revenue numeric:=0; v_cogs numeric:=0; v_variable numeric:=0; v_gross numeric:=0;
  v_contribution numeric:=0; v_units integer:=0; v_packing numeric:=0; v_shipping numeric:=0; v_gateway numeric:=0;
BEGIN
  SELECT COALESCE(SUM(COALESCE(oi.total_price,oi.quantity*oi.unit_price,0)),0),
         COALESCE(SUM(COALESCE(oi.quantity,0)*COALESCE(oi.cost_price,p.cost_price,0)),0),
         COALESCE(SUM(COALESCE(oi.quantity,0)),0)
    INTO v_revenue,v_cogs,v_units
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id=oi.product_id
  WHERE oi.order_id=p_order_id;

  SELECT COALESCE(o.packing_cost_net,o.packing_cost,0),
         COALESCE(o.shipping_cost_net,o.shipping_cost,0),
         COALESCE(o.gateway_fee_actual,o.gateway_fee_estimated,o.payment_fee,0)
    INTO v_packing,v_shipping,v_gateway
  FROM public.orders o WHERE o.id=p_order_id;

  v_gross:=v_revenue-v_cogs;
  v_variable:=v_packing+v_shipping+v_gateway;
  v_contribution:=v_gross-v_variable;

  UPDATE public.orders
     SET product_cost_total=v_cogs,
         product_cost_net=v_cogs,
         total_cost_net=v_cogs+v_variable,
         gross_profit=v_gross,
         margin_after_gateway=CASE WHEN v_revenue=0 THEN 0 ELSE v_contribution/v_revenue*100 END,
         order_cost=v_cogs+v_variable,
         order_profit=v_contribution,
         order_margin=CASE WHEN v_revenue=0 THEN 0 ELSE v_contribution/v_revenue*100 END
   WHERE id=p_order_id;

  RETURN jsonb_build_object('order_id',p_order_id,'revenue',v_revenue,'cogs',v_cogs,'gross_profit',v_gross,'variable_costs',v_variable,'contribution_profit',v_contribution,'units',v_units);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_all_order_profitability(p_days integer DEFAULT 365)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count bigint := 0; r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE created_at >= CURRENT_DATE - GREATEST(p_days,0) LOOP
    PERFORM public.recalculate_order_profitability(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_order_profitability(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_order_profitability(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
