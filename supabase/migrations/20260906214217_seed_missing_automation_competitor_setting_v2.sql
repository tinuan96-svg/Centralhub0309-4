insert into public.system_intelligence_settings (key, value, description)
values ('automation_competitor_enabled', false, 'Enable competitor tracking automation')
on conflict (key) do nothing;
