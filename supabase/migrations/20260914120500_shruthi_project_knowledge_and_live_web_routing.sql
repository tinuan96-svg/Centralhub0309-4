create table if not exists public.shruthi_project_knowledge (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  topic text not null,
  content text not null,
  source_type text not null default 'curated_chat',
  source_date date,
  priority integer not null default 50 check (priority between 0 and 100),
  tags text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, topic)
);

alter table public.shruthi_project_knowledge enable row level security;
revoke all on table public.shruthi_project_knowledge from anon;
revoke all on table public.shruthi_project_knowledge from authenticated;
grant select on table public.shruthi_project_knowledge to authenticated;

drop policy if exists shruthi_project_knowledge_admin_read on public.shruthi_project_knowledge;
create policy shruthi_project_knowledge_admin_read
on public.shruthi_project_knowledge
for select to authenticated
using (public.is_admin());

create index if not exists shruthi_project_knowledge_active_priority_idx
  on public.shruthi_project_knowledge (active, priority desc);
create index if not exists shruthi_project_knowledge_tags_gin_idx
  on public.shruthi_project_knowledge using gin (tags);

insert into public.shruthi_project_knowledge(scope,topic,content,source_type,source_date,priority,tags)
values
('core','centralhub_role','CentralHub is the private internal business control plane and sole-super-admin workspace. It coordinates stores, products, orders, finance, purchasing, marketing, analytics, customer care, security, monitoring and automation. Customer-facing storefronts must not expose CentralHub as their controller.','curated_chat','2026-09-14',100,array['centralhub','architecture','admin']),
('core','store_portfolio','The currently registered visible stores are MalluSpices (malluspices.com), KeralaGrocery (keralagrocery.com), PocketGrocery (pocketgrocery.com), and TamilRetail (tamilretail.com). Treat these as distinct stores inside one CentralHub control plane.','live_db_plus_chat','2026-09-14',100,array['stores','malluspices','keralagrocery','pocketgrocery','tamilretail']),
('products','master_data_rule','CentralHub public.products is the canonical product master. Storefront product data is a mirror/derived publication layer. Product identity, brand, category, price, stock, sale price, SKU, image and approval/publication decisions should originate from the canonical master and sync outward through the canonical sync path. Do not revive duplicate legacy sync methods unless the replacement is first verified.','curated_chat','2026-09-14',95,array['products','sync','master-data']),
('orders','sync_contract','Orders sync store-to-CentralHub and operational status changes must sync CentralHub-to-store. Paid-order truth, inventory deduction, shipment state and WhatsApp order events should be kept consistent end-to-end; stale store updates must not overwrite verified paid state.','curated_chat','2026-09-14',95,array['orders','sync','inventory','whatsapp']),
('analytics','analytics_pipeline','Store analytics flow is storefront tracking to CentralHub/Supabase analytics tables to CentralHub Analytics. Google/Meta connections and sync jobs are store-scoped. TamilRetail is one of the four managed stores and participates in CentralHub analytics/product-control workflows.','curated_chat','2026-09-14',85,array['analytics','google','meta','tamilretail']),
('deployment','deployment_policy','For CentralHub and store projects, batch related changes into one production deployment where practical. Keep canonical repositories on main; avoid unnecessary repositories/branches and avoid extra Netlify deploys for source-only bookkeeping changes.','curated_chat','2026-09-14',95,array['github','netlify','deployment','policy']),
('assistant','identity','The primary assistant identity is Shruthi (ശ്രുതി), a professional female executive assistant and overall business manager. NORA is a legacy wake/internal alias only, not a separate public assistant identity.','curated_chat','2026-09-14',100,array['shruthi','nora','identity']),
('assistant','behaviour','Shruthi adapts internally to the task: friendly and natural for ordinary conversation; concise executive mode for business decisions; analytical for investigation; operational for fulfilment/support; precise and restrained for finance, security, payments, legal or production incidents. Do not expose artificial mode buttons unless useful.','curated_chat','2026-09-14',100,array['shruthi','persona','executive-assistant']),
('assistant','autonomy_policy','Autonomy follows detect → diagnose → fix → verify → log → notify. Low-risk reversible remediation may be automatic when explicitly supported. Refunds, deletes, bank/payment settings, major pricing changes, permissions/ownership, legal or financial commitments, identity submissions and other consequential actions require explicit approval.','curated_chat','2026-09-14',100,array['autonomy','safety','approval']),
('assistant','live_web_policy','Shruthi Live Web is the visible in-app browser for external-site work. It may navigate, inspect, click, scroll and fill ordinary non-sensitive business details. Missing ordinary facts should be asked live. Passwords, OTP/2FA, CAPTCHA, recovery codes, API secrets and similar authentication secrets require manual user takeover and must not be stored. Final account creation, publishing, spend/payment, permissions/ownership, terms acceptance, deletion or identity/legal submission requires explicit approval.','curated_chat','2026-09-14',100,array['live-web','browser','computer-use','safety']),
('pricing','competitor_policy','Competitor intelligence compares Kerala grocery products using high-precision brand, pack-size and product-type matching. Auto-pricing is off by default; Dry Run and approval are required. Competitor signals include KeralaTaste, Pickeasy, Veensa and The Indian Shelf, with emphasis on meaningful launches, pack changes and unreasonable price differences.','curated_chat','2026-09-14',85,array['pricing','competitors','keralataste','pickeasy','veensa','indianshelf']),
('notifications','notification_policy','Avoid duplicate notifications. Suppress routine alerting when AI has already responded; notify when there is no response for over about 10 minutes or when AI raises a ticket. Store branding/logo should be preserved in notifications.','curated_chat','2026-09-14',75,array['notifications','customer-care','ai']),
('malluspices','service_context','MalluSpices is a UK Kerala-grocery storefront. Operational context historically includes UK-only delivery, DHL eCommerce UK fulfilment and CentralHub-managed product/order/WhatsApp integration. Treat live database/configuration as authoritative if a current value conflicts with this historical context.','curated_chat','2026-09-14',70,array['malluspices','dhl','uk']),
('keralagrocery','store_context','KeralaGrocery is a managed storefront at keralagrocery.com. It uses the shared CentralHub product/order/analytics control model while retaining store-scoped integrations and customer-facing identity.','curated_chat','2026-09-14',80,array['keralagrocery','store']),
('pocketgrocery','store_context','PocketGrocery is a managed storefront at pocketgrocery.com. It should consume canonical CentralHub product data and retain store-scoped analytics/integration state.','curated_chat','2026-09-14',80,array['pocketgrocery','store']),
('tamilretail','store_context','TamilRetail is a registered managed store at tamilretail.com. CentralHub has store-scoped analytics and product-sync handling for TamilRetail; its customer-facing identity remains separate from CentralHub.','curated_chat','2026-09-14',80,array['tamilretail','store','analytics','sync']),
('knowledge','freshness_rule','Project knowledge is context, not a substitute for live truth. When curated historical knowledge conflicts with current database state, connected integration state or a verified current configuration, use the live/verified value and explain the freshness difference when material.','curated_chat','2026-09-14',100,array['knowledge','freshness','truth'])
on conflict (scope,topic) do update set
  content=excluded.content,
  source_type=excluded.source_type,
  source_date=excluded.source_date,
  priority=excluded.priority,
  tags=excluded.tags,
  active=true,
  updated_at=now();

create or replace function public.nora_route_external_computer_task()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
declare
  v_text text := lower(coalesce(new.input_text,'') || ' ' || coalesce(new.action_name,''));
  v_key text;
  v_system text;
  v_url text;
  v_action_like boolean;
begin
  v_action_like := v_text ~ '(create|open|set up|setup|connect|configure|integrate|fix|change|update|manage|add|build|implement|publish|launch|start|do|work on|help me create|help me set up|search|look up|lookup|research|browse|find online|check online|scan website|visit website|check website)';
  if not v_action_like then return new; end if;

  if v_text ~ '(merchant center|google merchant|merchant account)' then
    v_key := 'google_merchant'; v_system := 'Google Merchant Center'; v_url := 'https://merchants.google.com/';
  elsif v_text ~ '(google ads|google advertising|adwords|ads account)' then
    v_key := 'google_ads'; v_system := 'Google Ads'; v_url := 'https://ads.google.com/';
  elsif v_text ~ '(google analytics|ga4|analytics account)' then
    v_key := 'google_analytics'; v_system := 'Google Analytics'; v_url := 'https://analytics.google.com/';
  elsif v_text ~ '(search console|google search console)' then
    v_key := 'google_search_console'; v_system := 'Google Search Console'; v_url := 'https://search.google.com/search-console/';
  elsif v_text ~ '(google business profile|google business|business profile)' then
    v_key := 'google_business'; v_system := 'Google Business Profile'; v_url := 'https://business.google.com/';
  elsif v_text ~ '(google account|gmail account)' then
    v_key := 'google_account'; v_system := 'Google Account'; v_url := 'https://accounts.google.com/';
  elsif v_text ~ '(instagram account|instagram profile|instagram signup|instagram sign up|create instagram|open instagram)' then
    v_key := 'instagram'; v_system := 'Instagram'; v_url := 'https://www.instagram.com/';
  elsif v_text ~ '(meta business|business manager|business suite|meta ads|facebook ads|ads manager|instagram business|connect instagram)' then
    v_key := 'meta_business'; v_system := 'Meta Business'; v_url := 'https://business.facebook.com/';
  elsif v_text ~ '(facebook account|facebook page|facebook)' then
    v_key := 'facebook'; v_system := 'Facebook'; v_url := 'https://www.facebook.com/';
  elsif v_text ~ '(spotify account|spotify profile|spotify)' then
    v_key := 'spotify'; v_system := 'Spotify'; v_url := 'https://www.spotify.com/';
  elsif v_text ~ '(shopify account|shopify admin|shopify store|shopify)' then
    v_key := 'shopify'; v_system := 'Shopify'; v_url := 'https://admin.shopify.com/';
  elsif v_text ~ 'github' then
    v_key := 'github'; v_system := 'GitHub'; v_url := 'https://github.com/';
  elsif v_text ~ 'netlify' then
    v_key := 'netlify'; v_system := 'Netlify'; v_url := 'https://app.netlify.com/';
  elsif v_text ~ 'supabase' then
    v_key := 'supabase'; v_system := 'Supabase'; v_url := 'https://supabase.com/dashboard/';
  elsif v_text ~ '(search the web|search web|look up online|lookup online|research online|browse the web|browse web|find online|check online|scan website|visit website|check website|external source|from the web|on the web)' then
    v_key := 'web_search'; v_system := 'Web Search'; v_url := 'https://www.google.com/';
  else
    return new;
  end if;

  new.status := 'ready_for_computer';
  new.requires_confirmation := false;
  new.action_payload := coalesce(new.action_payload, '{}'::jsonb) || jsonb_build_object(
    'computer_task', true,
    'computer_auto_start', true,
    'computer_target_key', v_key,
    'computer_target_system', v_system,
    'computer_target_url', v_url,
    'computer_goal', coalesce(new.input_text, new.action_name, 'Complete the requested task'),
    'approval_boundary', 'final_consequential_step'
  );
  return new;
end;
$$;

revoke execute on function public.nora_route_external_computer_task() from public, anon, authenticated;
