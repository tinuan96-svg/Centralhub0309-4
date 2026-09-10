create or replace function public.get_live_operations_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
visible_stores as (
  select id,name,slug,domain from public.stores where visibility is true
),
latest_hb as (
  select distinct on (store_id) store_id,status,latency_ms,http_status,tls_valid,security_score,checked_at
  from public.security_heartbeats
  order by store_id, checked_at desc
),
latest_health as (
  select distinct on (store_id) store_id,health_score,status,received_at
  from public.site_health_runs
  order by store_id, received_at desc nulls last
),
paid24 as (
  select id,store_id,total,order_status,created_at
  from public.orders
  where created_at >= now()-interval '24 hours'
    and coalesce(is_deleted,false)=false
    and lower(coalesce(payment_status,''))='paid'
    and lower(coalesce(order_status,'')) not in ('cancelled','refunded','failed')
),
hours as (
  select generate_series(date_trunc('hour',now())-interval '23 hours',date_trunc('hour',now()),interval '1 hour') as bucket
),
commerce_hourly as (
  select h.bucket,count(p.id)::int as orders,coalesce(sum(p.total),0)::numeric as revenue
  from hours h left join paid24 p on date_trunc('hour',p.created_at)=h.bucket
  group by h.bucket order by h.bucket
),
sessions24 as (
  select id,store_id,started_at,last_seen_at,engaged,converted,page_count,event_count
  from public.analytics_sessions
  where started_at >= now()-interval '24 hours'
),
traffic_hourly as (
  select h.bucket,count(s.id)::int as sessions
  from hours h left join sessions24 s on date_trunc('hour',s.started_at)=h.bucket
  group by h.bucket order by h.bucket
),
active_products as (
  select id,stock,low_stock_threshold,updated_at
  from public.products
  where coalesce(is_deleted,false)=false and coalesce(is_archived,false)=false
),
sync_core as (
  select status,created_at,error as err from public.sync_queue
),
sync_orders as (
  select status,created_at,last_error as err from public.order_sync_queue
),
open_issues as (
  select id,store_id,title,severity,risk_level,status,last_seen_at
  from public.site_health_issues
  where lower(coalesce(status,'')) not in ('resolved','closed','ignored')
),
security_open as (
  select id,store_id,title,severity,status,occurred_at,last_seen_at
  from public.security_events
  where occurred_at>=now()-interval '24 hours' and lower(coalesce(status,'')) in ('open','acknowledged')
),
messages24 as (
  select id,conversation_id,direction,status,delivery_error_code,created_at
  from public.whatsapp_messages where created_at>=now()-interval '24 hours'
),
ship7 as (
  select id,status,created_at,actual_delivery,actual_shipping_cost_gross,shipping_cost_source,error_message,tracking_error,last_tracked_at
  from public.shipments where created_at>=now()-interval '7 days'
),
alert_rows as (
  select 'security'::text as source, coalesce(title,event_type,'Security event') as title, severity, coalesce(last_seen_at,occurred_at) as event_at
  from public.security_events
  where occurred_at>=now()-interval '24 hours' and lower(coalesce(status,'')) in ('open','acknowledged')
  union all
  select 'site_health', coalesce(title,check_name,'Site health issue'), coalesce(severity,risk_level,'info'), last_seen_at
  from public.site_health_issues
  where lower(coalesce(status,'')) not in ('resolved','closed','ignored')
  union all
  select 'sync', 'Sync error · '||coalesce(table_name,'record'), 'high', created_at
  from public.sync_queue
  where error is not null and created_at>=now()-interval '24 hours'
  union all
  select 'order_sync', 'Order sync error', 'high', created_at
  from public.order_sync_queue
  where last_error is not null and created_at>=now()-interval '24 hours'
),
metrics as (
 select
   (select count(*)::int from visible_stores) as store_count,
   (select count(*)::int from visible_stores v join latest_hb h on h.store_id=v.id where h.checked_at>=now()-interval '3 minutes' and h.status='online') as stores_online,
   (select count(*)::int from visible_stores v left join latest_hb h on h.store_id=v.id where h.checked_at is null or h.checked_at<now()-interval '3 minutes') as stale_heartbeats,
   (select round(avg(h.security_score)::numeric,1) from visible_stores v join latest_hb h on h.store_id=v.id where h.checked_at>=now()-interval '3 minutes') as security_index,
   (select round(avg(l.health_score)::numeric,1) from visible_stores v join latest_health l on l.store_id=v.id where l.health_score is not null) as site_health_index,
   (select count(*)::int from paid24) as orders_24h,
   (select coalesce(sum(total),0)::numeric from paid24) as revenue_24h,
   (select count(*)::int from paid24 where created_at>=now()-interval '1 hour') as orders_60m,
   (select coalesce(sum(total),0)::numeric from paid24 where created_at>=now()-interval '1 hour') as revenue_60m,
   (select count(*)::int from sessions24 where last_seen_at>=now()-interval '5 minutes') as active_5m,
   (select count(*)::int from sessions24 where started_at>=now()-interval '1 hour') as sessions_60m,
   (select count(*)::int from sessions24) as sessions_24h,
   (select count(*)::int from sessions24 where converted is true) as converted_24h,
   (select coalesce(sum(page_count),0)::int from sessions24 where started_at>=now()-interval '1 hour') as page_views_60m,
   (select coalesce(sum(event_count),0)::int from sessions24 where started_at>=now()-interval '1 hour') as events_60m,
   (select count(*)::int from active_products) as products_total,
   (select count(*)::int from active_products where coalesce(stock,0)>coalesce(low_stock_threshold,5)) as stock_available,
   (select count(*)::int from active_products where coalesce(stock,0)>0 and coalesce(stock,0)<=coalesce(low_stock_threshold,5)) as stock_low,
   (select count(*)::int from active_products where coalesce(stock,0)<=0) as stock_zero,
   (select count(*)::int from public.inventory_movements where created_at>=now()-interval '1 hour') as movements_60m,
   (select count(*)::int from sync_core where lower(coalesce(status,'')) not in ('completed','processed','done','success','sent','failed','error') and err is null) as sync_pending,
   (select count(*)::int from sync_core where lower(coalesce(status,'')) in ('failed','error') or err is not null) as sync_failed,
   (select count(*)::int from sync_orders where lower(coalesce(status,'')) not in ('completed','processed','done','success','sent','failed','error') and err is null) as order_sync_pending,
   (select count(*)::int from sync_orders where lower(coalesce(status,'')) in ('failed','error') or err is not null) as order_sync_failed,
   (select min(created_at) from (
      select created_at from sync_core where lower(coalesce(status,'')) not in ('completed','processed','done','success','sent','failed','error') and err is null
      union all
      select created_at from sync_orders where lower(coalesce(status,'')) not in ('completed','processed','done','success','sent','failed','error') and err is null
   ) q) as oldest_pending_at,
   (select count(*)::int from public.whatsapp_conversations where status='open') as conversations_open,
   (select count(*)::int from public.whatsapp_conversations where status='open' and handling_mode='HUMAN') as conversations_human,
   (select count(*)::int from messages24 where created_at>=now()-interval '1 hour') as messages_60m,
   (select count(*)::int from messages24 where direction='inbound') as inbound_24h,
   (select count(*)::int from messages24 where direction='outbound') as outbound_24h,
   (select count(*)::int from messages24 where status='failed' or delivery_error_code is not null) as messages_failed_24h,
   (select count(*)::int from ship7) as shipments_7d,
   (select count(*)::int from ship7 where lower(coalesce(status,'')) not in ('delivered','completed','cancelled','failed') and actual_delivery is null) as shipments_in_transit,
   (select count(*)::int from ship7 where coalesce(actual_delivery,created_at)>=now()-interval '24 hours' and (actual_delivery is not null or lower(coalesce(status,'')) in ('delivered','completed'))) as shipments_delivered_24h,
   (select count(*)::int from ship7 where created_at>=now()-interval '24 hours' and (error_message is not null or tracking_error is not null)) as shipment_errors_24h,
   (select count(*)::int from ship7 where actual_shipping_cost_gross is not null and actual_shipping_cost_gross>0) as shipping_cost_verified_7d,
   (select count(*)::int from security_open) as security_open_24h,
   (select count(*)::int from security_open where severity='critical') as security_critical,
   (select count(*)::int from security_open where severity='high') as security_high,
   (select count(*)::int from open_issues) as site_issues_open,
   (select count(*)::int from open_issues where coalesce(severity,risk_level)='critical') as site_issues_critical,
   (select count(*)::int from open_issues where coalesce(severity,risk_level)='high') as site_issues_high
)
select jsonb_build_object(
 'sampled_at',now(),
 'network',jsonb_build_object('stores',m.store_count,'online',m.stores_online,'stale',m.stale_heartbeats,'security_index',m.security_index,'site_health_index',m.site_health_index),
 'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'slug',v.slug,'domain',v.domain,'security_status',case when h.checked_at is null or h.checked_at<now()-interval '3 minutes' then 'stale' else h.status end,'latency_ms',h.latency_ms,'http_status',h.http_status,'tls_valid',h.tls_valid,'security_score',h.security_score,'heartbeat_at',h.checked_at,'site_health_score',l.health_score,'site_health_status',l.status,'site_health_at',l.received_at,'orders_24h',(select count(*) from paid24 p where p.store_id=v.id),'revenue_24h',(select coalesce(sum(total),0) from paid24 p where p.store_id=v.id),'active_5m',(select count(*) from sessions24 s where s.store_id=v.id and s.last_seen_at>=now()-interval '5 minutes')) order by v.name),'[]'::jsonb) from visible_stores v left join latest_hb h on h.store_id=v.id left join latest_health l on l.store_id=v.id),
 'commerce',jsonb_build_object('orders_24h',m.orders_24h,'revenue_24h',m.revenue_24h,'orders_60m',m.orders_60m,'revenue_60m',m.revenue_60m,'average_order_24h',case when m.orders_24h>0 then round(m.revenue_24h/m.orders_24h,2) else null end,'picking',(select count(*) from paid24 where order_status in ('confirmed','processing','picking')),'packing',(select count(*) from paid24 where order_status in ('picked','packing','ready_for_packing')),'dispatch',(select count(*) from paid24 where order_status in ('packed','ready_to_ship')),'in_delivery',(select count(*) from paid24 where order_status in ('shipped','shipment_booked','collected','at_local_depot','out_for_delivery','delivery_attempted','delivery_rescheduled')),'delivered',(select count(*) from paid24 where order_status in ('delivered','completed')),'hourly',(select jsonb_agg(jsonb_build_object('at',bucket,'orders',orders,'revenue',revenue) order by bucket) from commerce_hourly)),
 'traffic',jsonb_build_object('active_5m',m.active_5m,'sessions_60m',m.sessions_60m,'sessions_24h',m.sessions_24h,'converted_24h',m.converted_24h,'page_views_60m',m.page_views_60m,'events_60m',m.events_60m,'hourly',(select jsonb_agg(jsonb_build_object('at',bucket,'sessions',sessions) order by bucket) from traffic_hourly)),
 'inventory',jsonb_build_object('total',m.products_total,'available',m.stock_available,'low',m.stock_low,'zero',m.stock_zero,'movements_60m',m.movements_60m),
 'sync',jsonb_build_object('pending',m.sync_pending,'failed',m.sync_failed,'order_pending',m.order_sync_pending,'order_failed',m.order_sync_failed,'oldest_pending_at',m.oldest_pending_at),
 'communications',jsonb_build_object('open',m.conversations_open,'human',m.conversations_human,'messages_60m',m.messages_60m,'inbound_24h',m.inbound_24h,'outbound_24h',m.outbound_24h,'failed_24h',m.messages_failed_24h),
 'shipping',jsonb_build_object('shipments_7d',m.shipments_7d,'in_transit',m.shipments_in_transit,'delivered_24h',m.shipments_delivered_24h,'errors_24h',m.shipment_errors_24h,'cost_verified_7d',m.shipping_cost_verified_7d),
 'security',jsonb_build_object('open_24h',m.security_open_24h,'critical',m.security_critical,'high',m.security_high),
 'site_health',jsonb_build_object('open',m.site_issues_open,'critical',m.site_issues_critical,'high',m.site_issues_high),
 'alerts',(select coalesce(jsonb_agg(jsonb_build_object('source',source,'title',title,'severity',severity,'at',event_at) order by event_at desc),'[]'::jsonb) from (select * from alert_rows where event_at is not null order by event_at desc limit 12) z)
) from metrics m;
$$;

revoke all on function public.get_live_operations_snapshot() from public;
revoke all on function public.get_live_operations_snapshot() from anon;
grant execute on function public.get_live_operations_snapshot() to authenticated;
