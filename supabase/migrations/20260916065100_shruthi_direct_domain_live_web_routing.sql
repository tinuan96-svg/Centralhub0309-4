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
  v_direct_domain_like boolean;
  v_domain text;
  v_goal text;
begin
  v_action_like := v_text ~ '(create|open|set up|setup|connect|configure|integrate|fix|change|update|manage|add|build|implement|publish|launch|start|do|work on|help me create|help me set up|search|look up|lookup|research|browse|find online|check online|scan website|visit website|check website|inspect|go to|look at|latest news|latest update|news about|find out)';
  if not v_action_like then
    return new;
  end if;

  v_web_search_like := v_text ~ '(search|look up|lookup|research|browse|find online|check online|scan website|visit website|check website|latest news|latest update|news about|find out|public web|on the web|from the web)';
  v_direct_domain_like := v_text ~ '(open|visit|browse|search|check|scan|inspect|go to|look at|research|look up|lookup)';

  v_domain := substring(v_text from '((www\.)?[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,})');
  if v_domain is not null then
    v_domain := regexp_replace(v_domain, '^www\.', '');
  end if;

  if v_text ~ '(merchant center|google merchant|merchant account)' then
    v_key := 'google_merchant_center'; v_system := 'Google Merchant Center'; v_url := 'https://merchants.google.com/';
  elsif v_text ~ '(google ads|ads.google)' then
    v_key := 'google_ads'; v_system := 'Google Ads'; v_url := 'https://ads.google.com/';
  elsif v_text ~ '(meta business|business manager|facebook business|instagram business)' then
    v_key := 'meta_business'; v_system := 'Meta Business'; v_url := 'https://business.facebook.com/';
  elsif v_text ~ '(meta developer|developer meta|facebook developer)' then
    v_key := 'meta_developer'; v_system := 'Meta for Developers'; v_url := 'https://developers.facebook.com/';
  elsif v_text ~ 'supabase' then
    v_key := 'supabase'; v_system := 'Supabase'; v_url := 'https://supabase.com/dashboard';
  elsif v_text ~ 'netlify' then
    v_key := 'netlify'; v_system := 'Netlify'; v_url := 'https://app.netlify.com/';
  elsif v_text ~ 'github' then
    v_key := 'github'; v_system := 'GitHub'; v_url := 'https://github.com/';
  elsif v_direct_domain_like and v_domain is not null then
    v_key := 'external_web'; v_system := v_domain; v_url := 'https://' || v_domain || '/';
  elsif v_web_search_like then
    v_key := 'web_search'; v_system := 'Web Search'; v_url := 'https://www.google.com/';
  else
    return new;
  end if;

  v_goal := coalesce(new.input_text, new.action_name, 'Complete the requested task') || E'\n\nLive Web handling: if a routine cookie-consent banner blocks the requested page, handle it without asking the user. Prefer Reject non-essential, Reject all, or Necessary only when available. If the only practical option needed to continue is Accept or Accept all, use it and continue. Cookie consent alone is routine navigation and does not require approval. This does not authorize accepting Terms of Service, contracts, subscriptions, marketing opt-ins, account terms, or legal declarations.';

  new.status := 'ready_for_computer';
  new.requires_confirmation := false;
  new.action_payload := coalesce(new.action_payload, '{}'::jsonb) || jsonb_build_object(
    'computer_task', true,
    'computer_auto_start', true,
    'computer_target_key', v_key,
    'computer_target_system', v_system,
    'computer_target_url', v_url,
    'computer_goal', v_goal,
    'approval_boundary', 'final_consequential_step'
  );
  return new;
end;
$$;

revoke execute on function public.nora_route_external_computer_task() from public, anon, authenticated;
