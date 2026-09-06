-- Correct only legacy selling-size records independently verified against exact brand + product listings.
-- Ambiguous products remain REVIEW_REQUIRED; this migration deliberately does not guess.

update public.products
set weight=1, unit='kg', weight_kg=1, weight_grams=1000, updated_at=now()
where sku='EAS-MEL-1' and lower(trim(coalesce(brand,'')))='melam' and lower(trim(name))='easy upma mix';

update public.products
set weight=1, unit='kg', weight_kg=1, weight_grams=1000, updated_at=now()
where sku='IDL-DOU-1' and lower(trim(coalesce(brand,'')))='double horse' and lower(trim(name))='idly rava';

update public.products
set weight=5, unit='kg', weight_kg=5, weight_grams=5000, updated_at=now()
where sku='JAY-DOU-1' and lower(trim(coalesce(brand,'')))='double horse' and lower(trim(name))='jaya rice';

update public.products
set weight=10, unit='kg', weight_kg=10, weight_grams=10000, updated_at=now()
where sku='MAT-DOU-1-2' and lower(trim(coalesce(brand,'')))='double horse' and lower(trim(name))='matta rice';

update public.products
set weight=3, unit='l', weight_kg=null, weight_grams=null, updated_at=now()
where sku='SUN-KTC-1-2' and lower(trim(coalesce(brand,'')))='ktc' and lower(trim(name))='sunflower oil';

update public.products
set weight=1, unit='kg', weight_kg=1, weight_grams=1000, updated_at=now()
where sku='PAT-TAM-1' and lower(trim(coalesce(brand,'')))='tameemi' and lower(trim(name))='pathiri podi';

update public.products
set weight=1, unit='kg', weight_kg=1, weight_grams=1000, updated_at=now()
where sku='STE-TAM-1' and lower(trim(coalesce(brand,'')))='tameemi' and lower(trim(name))='steam puttu podi';

update public.products
set weight=1, unit='kg', weight_kg=1, weight_grams=1000, updated_at=now()
where sku='ROA-DOU-1-3' and lower(trim(coalesce(brand,'')))='double horse' and lower(trim(name))='roasted white rice powder';

select public.refresh_product_measurement_canonical(id)
from public.products
where sku in ('EAS-MEL-1','IDL-DOU-1','JAY-DOU-1','MAT-DOU-1-2','SUN-KTC-1-2','PAT-TAM-1','STE-TAM-1','ROA-DOU-1-3');

update public.competitor_prices
set source_stock_status=source_stock_status
where product_id in (
  select id from public.products where sku in ('EAS-MEL-1','IDL-DOU-1','JAY-DOU-1','MAT-DOU-1-2','SUN-KTC-1-2','PAT-TAM-1','STE-TAM-1','ROA-DOU-1-3')
);
select public.refresh_competitor_data_quality();