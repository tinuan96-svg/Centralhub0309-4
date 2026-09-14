insert into public.shruthi_project_knowledge(scope,topic,content,source_type,source_date,priority,tags)
values (
  'competitors',
  'market_supervisor',
  'Shruthi Market Supervisor is the AI intelligence layer above the deterministic competitor scanner. Raw competitor facts and identity/pack matching remain scanner-authoritative. Shruthi reviews only verified fresh in-stock non-conditional market evidence, checks profit floors, shipping/promotions/outliers and ambiguous matches, and classifies products as KEEP, REDUCE, INCREASE or INVESTIGATE. Auto-pricing remains OFF and Dry Run remains ON. Any concrete price-movement recommendation must be manually promoted to Pricing Approval Centre and pass its normal data-quality and approval gates before any execution.',
  'live_system',
  '2026-09-14',
  100,
  array['competitors','pricing','shruthi','dry-run','approval','market-supervisor']
)
on conflict (scope,topic) do update set
  content=excluded.content,
  source_type=excluded.source_type,
  source_date=excluded.source_date,
  priority=excluded.priority,
  tags=excluded.tags,
  active=true,
  updated_at=now();
