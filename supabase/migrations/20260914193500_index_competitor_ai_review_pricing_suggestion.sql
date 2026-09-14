create index if not exists competitor_ai_reviews_pricing_suggestion_idx
  on public.competitor_ai_reviews(pricing_suggestion_id)
  where pricing_suggestion_id is not null;
