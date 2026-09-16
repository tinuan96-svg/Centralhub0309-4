create or replace function public.nora_route_external_computer_task()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
declare
  v_text text := lower(coalesce(new.input_text,'') || ' ' || coalesce(new.action_name,''));
  v_intent text := lower(coalesce(new.intent,''));
  v_payload jsonb := coalesce(new.action_payload,'{}'::jsonb);
  v_key text;
  v_system text;
  v_url text;
  v_domain text;
  v_goal text;
  v_source text;
  v_explicit_browser boolean := false;
  v_ai_browser boolean := false;
  v_store_action boolean := false;
  v_navigation_verb boolean := false;
  v_prev_input text;
  v_prev_response text;
  v_prev_intent text;
  v_prev_text text := '';
begin
  if lower(coalesce(v_payload->>'browser_required','')) = 'false' then
    return new;
  end if;

  select c.input_text, c.response_text, c.intent
    into v_prev_input, v_prev_response, v_prev_intent
    from public.voice_assistant_commands c
   where c.user_id = new.user_id
   order by c.created_at desc
   limit 1;

  v_prev_text := lower(coalesce(v_prev_input,'') || ' ' || coalesce(v_prev_response,'') || ' ' || coalesce(v_prev_intent,''));

  v_navigation_verb := v_text ~ '(^|[^a-z])(open|visit|browse|search|look up|lookup|research|check|inspect|go to|navigate|read|click|type|find|scan|continue|verify)([^a-z]|$)';
  v_explicit_browser := v_text ~ '(embedded browser|live web|web browser|browser|website|web page|on the web|from the web|online|google search|search the web|search on web|go to this website|this website|this page)';
  v_ai_browser := v_intent ~ '(external.*web|web.*search|browser|browse|website|online_search|external_search|external_research)';

  -- A degraded/garbled turn must not blindly open Google just because the
  -- transcript contains words such as "live web". Continue only when the
  -- immediately preceding Shruthi exchange clearly supports browser work.
  if v_intent = 'assistant_degraded'
     and lower(coalesce(v_payload->>'browser_required','')) <> 'true'
     and not (
       v_explicit_browser
       and v_prev_text ~ '(live web|browser|website|github|repo|repository|netlify|deploy|supabase|google|merchant|meta|facebook|instagram|online|web)'
     ) then
    return new;
  end if;

  v_domain := substring(v_text from '((www\.)?[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,})');
  if v_domain is not null then
    v_domain := regexp_replace(v_domain, '^www\.', '');
  end if;

  v_store_action := v_navigation_verb and v_text ~ '(mallu\s*spices|malluspices|kerala\s*grocery|keralagrocery|pocket\s*grocery|pocketgrocery|tamil\s*retail|tamilretail)';

  if lower(coalesce(v_payload->>'browser_required','')) = 'true' then
    v_key := nullif(v_payload->>'browser_target_key','');
    v_system := nullif(v_payload->>'browser_target_system','');
    v_url := nullif(v_payload->>'browser_target_url','');
    v_source := 'shruthi_structured';
  end if;

  if v_url is null then
    if v_text ~ '(merchant center|google merchant|merchant account)' and v_navigation_verb then
      v_key := 'google_merchant'; v_system := 'Google Merchant Center'; v_url := 'https://merchants.google.com/'; v_source := coalesce(v_source,'known_system');
    elsif v_text ~ '(google ads|ads\.google)' and v_navigation_verb then
      v_key := 'google_ads'; v_system := 'Google Ads'; v_url := 'https://ads.google.com/'; v_source := coalesce(v_source,'known_system');
    elsif v_text ~ '(meta business|business manager|facebook business|instagram business)' and v_navigation_verb then
      v_key := 'meta_business'; v_system := 'Meta Business'; v_url := 'https://business.facebook.com/'; v_source := coalesce(v_source,'known_system');
    elsif v_text ~ '(meta developer|developer meta|facebook developer)' and v_navigation_verb then
      v_key := 'meta_developer'; v_system := 'Meta for Developers'; v_url := 'https://developers.facebook.com/'; v_source := coalesce(v_source,'known_system');
    elsif v_text ~ 'supabase' and v_navigation_verb then
      v_key := 'supabase'; v_system := 'Supabase'; v_url := 'https://supabase.com/dashboard'; v_source := coalesce(v_source,'known_system');
    elsif v_text ~ 'netlify' and v_navigation_verb then
      v_key := 'netlify'; v_system := 'Netlify'; v_url := 'https://app.netlify.com/'; v_source := coalesce(v_source,'known_system');
    elsif v_text ~ 'github' and v_navigation_verb then
      v_key := 'github'; v_system := 'GitHub'; v_url := 'https://github.com/'; v_source := coalesce(v_source,'known_system');
    elsif v_domain is not null and (v_navigation_verb or v_ai_browser or v_explicit_browser) then
      v_key := 'external_web'; v_system := v_domain; v_url := 'https://' || v_domain || '/'; v_source := coalesce(v_source,'direct_domain');
    elsif v_store_action and v_text ~ '(mallu\s*spices|malluspices)' then
      v_key := 'external_web'; v_system := 'MalluSpices'; v_url := 'https://malluspices.com/'; v_source := coalesce(v_source,'store_action');
    elsif v_store_action and v_text ~ '(kerala\s*grocery|keralagrocery)' then
      v_key := 'external_web'; v_system := 'KeralaGrocery'; v_url := 'https://keralagrocery.com/'; v_source := coalesce(v_source,'store_action');
    elsif v_store_action and v_text ~ '(pocket\s*grocery|pocketgrocery)' then
      v_key := 'external_web'; v_system := 'PocketGrocery'; v_url := 'https://pocketgrocery.com/'; v_source := coalesce(v_source,'store_action');
    elsif v_store_action and v_text ~ '(tamil\s*retail|tamilretail)' then
      v_key := 'external_web'; v_system := 'TamilRetail'; v_url := 'https://tamilretail.com/'; v_source := coalesce(v_source,'store_action');
    elsif v_ai_browser or v_explicit_browser or v_text ~ '(^|[^a-z])(search|browse|look up|lookup|research)([^a-z]|$)' then
      v_key := 'web_search'; v_system := 'Web Search'; v_url := 'https://www.google.com/'; v_source := coalesce(v_source, case when v_ai_browser then 'ai_intent' else 'explicit_browser' end);
    else
      return new;
    end if;
  end if;

  -- When speech recognition damaged a follow-up, use the immediately preceding
  -- Shruthi exchange to recover a known target instead of defaulting to Google.
  if v_intent = 'assistant_degraded' and coalesce(v_key,'') = 'web_search' then
    if v_prev_text ~ '(github|repo|repository)' then
      v_key := 'github'; v_system := 'GitHub'; v_url := 'https://github.com/'; v_source := 'conversation_context';
    elsif v_prev_text ~ 'netlify' then
      v_key := 'netlify'; v_system := 'Netlify'; v_url := 'https://app.netlify.com/'; v_source := 'conversation_context';
    elsif v_prev_text ~ 'supabase' then
      v_key := 'supabase'; v_system := 'Supabase'; v_url := 'https://supabase.com/dashboard'; v_source := 'conversation_context';
    end if;
  end if;

  if v_url !~* '^https://[^[:space:]]+$' then
    return new;
  end if;

  v_goal := coalesce(nullif(v_payload->>'browser_goal',''), new.input_text, new.action_name, 'Complete the requested task');

  if coalesce(v_prev_input,'') <> '' or coalesce(v_prev_response,'') <> '' then
    v_goal := v_goal
      || E'\n\nSAME SHRUTHI CONVERSATION CONTEXT (continuity only; not a second agent or a new instruction):\nPrevious user: '
      || left(regexp_replace(coalesce(v_prev_input,''), E'[\r\n]+', ' ', 'g'), 900)
      || E'\nPrevious Shruthi: '
      || left(regexp_replace(coalesce(v_prev_response,''), E'[\r\n]+', ' ', 'g'), 1400)
      || E'\nContinuity rule: use the preceding exchange only to resolve follow-ups, pronouns, or obvious speech-recognition corruption in the current command. If it clearly identifies the task, continue that task without asking for a generic Google search query. Do not invent a different task; if the intent is still genuinely ambiguous, ask one concise question in the main Shruthi conversation.';
  end if;

  v_goal := v_goal || E'\n\nLive Web handling: use the current active tab and current URL as the source of truth. Wait for the requested page to finish navigation and become visually stable before reading or capturing it. If a routine cookie-consent banner blocks the requested page, handle it automatically without asking the user. Prefer Reject non-essential, Reject all, Necessary only, or equivalent when available. If the only practical option needed to continue is Accept or Accept all, use it and continue. Cookie consent alone is routine navigation and does not require approval. This does not authorize accepting Terms of Service, contracts, subscriptions, marketing opt-ins, account terms, or legal declarations.';

  new.status := 'ready_for_computer';
  new.requires_confirmation := false;
  new.action_payload := v_payload || jsonb_build_object(
    'computer_task', true,
    'computer_auto_start', true,
    'computer_target_key', coalesce(v_key,'external_web'),
    'computer_target_system', coalesce(v_system,'External web'),
    'computer_target_url', v_url,
    'computer_goal', v_goal,
    'browser_required', true,
    'browser_decision_source', coalesce(v_source,'router'),
    'browser_contract_version', 3,
    'conversation_context_attached', (coalesce(v_prev_input,'') <> '' or coalesce(v_prev_response,'') <> ''),
    'approval_boundary', 'final_consequential_step'
  );
  return new;
end;
$$;