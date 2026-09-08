-- Connect competitor scheduled scans to Automation Control Centre safety switches.
-- Also prevent incomplete bank-feed coverage from being presented as a real £0 closing balance.

create or replace function public.trigger_competitor_auto_scan()
returns void
language plpgsql
security definer
set search_path to 'public','net','pg_temp'
as $$
declare
  v_global boolean := false;
  v_competitor boolean := false;
  v_secret text;
  v_request_id bigint;
begin
  select coalesce((select value from public.system_intelligence_settings where key='automation_global_enabled'), false) into v_global;
  select coalesce((select value from public.system_intelligence_settings where key='automation_competitor_enabled'), false) into v_competitor;

  if not v_global or not v_competitor then
    insert into public.competitor_audit_logs(action, details)
    values ('AUTOMATION_SKIPPED', jsonb_build_object('module','competitor','global_enabled',v_global,'module_enabled',v_competitor,'reason',case when not v_global then 'global_kill_switch' else 'module_disabled' end,'timestamp',now()));
    return;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name='competitor_scan_cron_secret' order by created_at desc limit 1;
  if nullif(v_secret,'') is null then
    insert into public.competitor_audit_logs(action, details) values ('AUTOMATION_BLOCKED', jsonb_build_object('module','competitor','reason','missing_cron_secret','timestamp',now()));
    return;
  end if;

  select id into v_request_id from net.http_post(
    url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/competitor-price-scanner',
    headers := jsonb_build_object('Content-Type','application/json','x-competitor-scan-secret',v_secret),
    body := '{"action":"scan"}'::jsonb,
    timeout_milliseconds := 120000
  );
  insert into public.competitor_audit_logs(action, details) values ('AUTOMATION_TRIGGERED', jsonb_build_object('module','competitor','net_request_id',v_request_id,'timestamp',now()));
end;
$$;

grant execute on function public.trigger_competitor_auto_scan() to postgres;

do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname='competitor-auto-scan' loop perform cron.unschedule(r.jobid); end loop;
end $$;

select cron.schedule('competitor-auto-scan','0 */6 * * *','select public.trigger_competitor_auto_scan();');

create or replace function public.get_financial_performance(p_start_date date, p_end_date date, p_store_id uuid default null::uuid)
returns table(revenue numeric, cogs numeric, variable_costs numeric, operating_expenses numeric, finance_costs numeric, taxes numeric, gross_profit numeric, contribution_profit numeric, net_profit numeric, orders bigint, units_sold bigint, average_orders_per_day numeric, average_revenue_per_day numeric, average_profit_per_day numeric, average_profit_per_order numeric, cash_in numeric, cash_out numeric, closing_cash numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
with pnl as (
  select * from public.v_financial_daily_pnl where business_date between p_start_date and p_end_date and (p_store_id is null or store_id=p_store_id)
),
cash_flow as (
  select coalesce(sum(case when bt.type='credit' then bt.amount else 0 end),0) as cash_in, coalesce(sum(case when bt.type='debit' then bt.amount else 0 end),0) as cash_out
  from public.bank_transactions bt where bt.transaction_date between p_start_date and p_end_date and (p_store_id is null or bt.store_id=p_store_id)
),
account_closing as (
  select sba.id,
         case when latest.balance is not null then true when p_end_date>=current_date and sba.last_synced_at is not null and sba.current_balance is not null then true else false end as has_trusted_balance,
         coalesce(latest.balance, case when p_end_date>=current_date and sba.last_synced_at is not null then sba.current_balance end) as closing_balance
  from public.store_bank_accounts sba
  left join lateral (
    select bt.balance from public.bank_transactions bt where bt.bank_account_id=sba.id and bt.balance is not null and bt.transaction_date<=p_end_date
    order by bt.transaction_date desc,bt.transaction_time desc nulls last,bt.updated_at desc,bt.id desc limit 1
  ) latest on true
  where sba.is_active=true and coalesce(sba.account_scope,'store')='store' and (p_store_id is null or sba.store_id=p_store_id)
),
cash as (
  select cf.cash_in,cf.cash_out,case when count(ac.id)=0 then null::numeric when bool_and(ac.has_trusted_balance) then sum(ac.closing_balance) else null::numeric end as closing_cash
  from cash_flow cf left join account_closing ac on true group by cf.cash_in,cf.cash_out
)
select coalesce(sum(pnl.revenue),0),coalesce(sum(pnl.cogs),0),coalesce(sum(pnl.variable_costs),0),coalesce(sum(pnl.operating_expenses),0),coalesce(sum(pnl.finance_costs),0),coalesce(sum(pnl.taxes),0),coalesce(sum(pnl.gross_profit),0),coalesce(sum(pnl.contribution_profit),0),coalesce(sum(pnl.net_profit),0),coalesce(sum(pnl.orders),0)::bigint,coalesce(sum(pnl.units_sold),0)::bigint,
       coalesce(sum(pnl.orders),0)/greatest((p_end_date-p_start_date)+1,1),coalesce(sum(pnl.revenue),0)/greatest((p_end_date-p_start_date)+1,1),coalesce(sum(pnl.net_profit),0)/greatest((p_end_date-p_start_date)+1,1),case when coalesce(sum(pnl.orders),0)>0 then coalesce(sum(pnl.net_profit),0)/sum(pnl.orders) else 0 end,max(cash.cash_in),max(cash.cash_out),max(cash.closing_cash)
from pnl cross join cash;
$function$;
