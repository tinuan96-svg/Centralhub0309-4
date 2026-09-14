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
  v_web_search_like boolean;
begin
  v_action_like := v_text ~ '(create|open|set up|setup|connect|configure|integrate|fix|change|update|manage|add|build|implement|publish|launch|start|do|work on|help me create|help me set up|search|look up|lookup|research|browse|find online|check online|scan website|visit website|check website|latest news|latest update|news about|find out)';
  if not v_action_like then return new; end if;

  v_web_search_like := v_text ~ '(search|look up|lookup|research|browse|find online|check online|scan website|visit website|check website|latest news|latest update|news about|find out|public web|on the web|from the web)';

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
  elsif v_web_search_like then
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
