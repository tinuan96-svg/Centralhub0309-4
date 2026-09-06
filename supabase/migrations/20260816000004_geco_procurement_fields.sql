/*
# Geco Procurement Enhancements

1. Changes
  - Add `case_price` (numeric) to `product_suppliers`
  - Add `unit_price` (numeric) to `product_suppliers`
  - Add `unit_of_measure` (text) to `product_suppliers`
  - Add `product_type` (text) to `product_suppliers`
  - Add `supplier_brand` (text) to `product_suppliers`
  - Update Geco International Limited import instructions
*/

-- 1. Add missing columns to product_suppliers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'case_price') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN case_price numeric(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'unit_price') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN unit_price numeric(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'unit_of_measure') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN unit_of_measure text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'product_type') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN product_type text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'supplier_brand') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN supplier_brand text;
  END IF;
END $$;

-- 2. Add file_url to supplier_price_list_history
ALTER TABLE public.supplier_price_list_history ADD COLUMN IF NOT EXISTS file_url text;

-- 2. Configure Geco International Limited import instructions
DO $$
DECLARE
    geco_id uuid;
BEGIN
    SELECT id INTO geco_id FROM suppliers WHERE name = 'Geco International Limited' LIMIT 1;

    IF geco_id IS NOT NULL THEN
        UPDATE suppliers
        SET import_instructions = '{
            "sheet_name": "Product and Price List",
            "header_row": 7,
            "mapping": {
                "brand": "Brand",
                "supplier_sku": "Product Code",
                "name": "Product Description",
                "case_price": "Price",
                "unit_price": "Unit Price",
                "product_type": "Product Type"
            },
            "special_rules": {
                "extract_pack_info": true,
                "store_dual_prices": true,
                "strict_format": true
            }
        }'::jsonb
        WHERE id = geco_id;
    ELSE
        INSERT INTO suppliers (name, is_active, import_instructions)
        VALUES ('Geco International Limited', true, '{
            "sheet_name": "Product and Price List",
            "header_row": 7,
            "mapping": {
                "brand": "Brand",
                "supplier_sku": "Product Code",
                "name": "Product Description",
                "case_price": "Price",
                "unit_price": "Unit Price",
                "product_type": "Product Type"
            },
            "special_rules": {
                "extract_pack_info": true,
                "store_dual_prices": true,
                "strict_format": true
            }
        }'::jsonb);
    END IF;
END $$;
