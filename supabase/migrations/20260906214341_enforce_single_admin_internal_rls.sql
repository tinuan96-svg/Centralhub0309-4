-- CentralHub is an internal, single-admin control plane. Storefront customer accounts
-- must never inherit access to CentralHub operations just because they are authenticated.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth'
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Replace legacy permissive policies on clearly internal/control-plane tables with
-- one strict admin policy. Supabase service_role integrations continue to bypass RLS.
do $$
declare
  t text;
  p record;
  internal_tables text[] := array[
    'ai_usage_logs','automation_execution_log','automation_policies',
    'backorder_items','backorder_plan_items','backorder_plans',
    'business_metrics','business_targets',
    'comm_idempotency_log',
    'competitor_audit_logs','competitor_catalog_items','competitor_discovery_sessions','competitor_price_history','competitor_prices','competitors',
    'customer_intelligence','customer_product_interest','customers',
    'dhl_gmail_watch_state','dhl_invoice_charges','dhl_invoice_imports',
    'expenses','finance_payable_alerts',
    'intelligence_audit_log','intelligence_recommendations',
    'inventory_expiry_writeoffs','inventory_forecasts','inventory_logs','inventory_movements',
    'kb_articles','kb_categories',
    'market_discovery_candidates','market_discovery_jobs','market_discovery_runs','market_discovery_settings',
    'marketing_connections','marketing_provider_configs','marketing_providers','marketing_oauth_states',
    'material_purchase_order_items','message_templates',
    'notifications','order_notifications','order_items','order_packing','order_packing_items','order_status_history','order_whatsapp_notifications','orders',
    'payout_reconciliations','po_drafts',
    'price_change_audit','price_locks','pricing_rules','pricing_settings','pricing_suggestions',
    'product_affinity','product_bin_locations','product_economics','product_expiry','product_measurement_canonical',
    'promotion_stores','promotions',
    'purchase_order_items','purchase_orders','purchase_receipt_items','purchase_receipts','purchase_reconciliations',
    'sales_recommendations','sender_profiles','shipment_events','shipments','shipping_rates_cache',
    'store_api_credentials','store_bank_accounts','store_business_identity','store_database_connections','store_google_finance_settings','store_phone_alert_settings','store_product_variants','store_visibility_rules','store_whatsapp_settings','stores',
    'supplier_invoice_items','supplier_invoice_payments','supplier_invoices','supplier_price_list_history','supplier_price_lists','suppliers',
    'support_tickets','system_intelligence_settings','system_notifications','push_subscriptions',
    'warehouse_logs','warehouses',
    'whatsapp_channels','whatsapp_contacts','whatsapp_conversations','whatsapp_event_template_mappings','whatsapp_messages','whatsapp_notification_queue','whatsapp_outbound_log','whatsapp_template_registry','whatsapp_webhook_events',
    'analytics_store_configs','app_config','customer_lifecycle_config','integration_cron_tokens','site_health_store_configs',
    'app_marketing_apps','app_marketing_daily_metrics','app_marketing_sync_runs','app_release_events','app_release_jobs','app_releases','google_ads_billing_setups'
  ];
begin
  foreach t in array internal_tables loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relkind in ('r','p')
    ) then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format(
        'create policy centralhub_admin_only on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        t
      );
      execute format('revoke all privileges on table public.%I from anon', t);
    end if;
  end loop;
end $$;

-- Preserve public catalogue reads, but remove the legacy profile_role write bypass
-- and require the canonical JWT admin claim for catalogue mutations.
do $$
declare
  t text;
  p record;
  catalogue_tables text[] := array['products','categories','brands','banners'];
begin
  foreach t in array catalogue_tables loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relkind in ('r','p')
    ) then
      for p in
        select policyname from pg_policies
        where schemaname='public' and tablename=t and cmd in ('INSERT','UPDATE','DELETE','ALL')
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format('create policy centralhub_admin_insert on public.%I for insert to authenticated with check (public.is_admin())', t);
      execute format('create policy centralhub_admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
      execute format('create policy centralhub_admin_delete on public.%I for delete to authenticated using (public.is_admin())', t);
    end if;
  end loop;
end $$;

-- Explicitly deny anonymous access to the highest-risk historical surfaces even if
-- an old grant is reintroduced outside RLS later.
revoke all privileges on table public.whatsapp_channels from anon;
revoke all privileges on table public.stores from anon;
revoke all privileges on table public.business_metrics from anon;
revoke all privileges on table public.inventory_logs from anon;
revoke all privileges on table public.supplier_price_list_history from anon;
