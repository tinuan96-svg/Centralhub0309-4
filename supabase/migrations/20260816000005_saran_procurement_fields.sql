/*
# Saran Enterprise Ltd Procurement Enhancements

1. Changes
  - Add `supplier_comment` (text) to `product_suppliers` table.
  - Configure Saran Enterprise Ltd import instructions.
*/

-- 1. Add supplier_comment to product_suppliers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'supplier_comment') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN supplier_comment text;
  END IF;
END $$;

-- 2. Configure Saran Enterprise Ltd import instructions
DO $$
DECLARE
    saran_id uuid;
BEGIN
    SELECT id INTO saran_id FROM suppliers WHERE name = 'Saran Enterprise Ltd' LIMIT 1;

    IF saran_id IS NOT NULL THEN
        UPDATE suppliers
        SET import_instructions = '{
            "sheet_name": "Sheet1",
            "header_row": 7,
            "mapping": {
                "name": "supplier_product_name",
                "pack_size": "pack_size / weight",
                "case_quantity": "case_quantity",
                "unit_price": "unit_price",
                "case_price": "case_price",
                "supplier_comment": "supplier_comment"
            },
            "special_rules": {
                "ignore_category_rows": true,
                "strict_format": true,
                "matching_priority": ["mapping", "barcode", "name_and_pack"]
            }
        }'::jsonb
        WHERE id = saran_id;
    ELSE
        INSERT INTO suppliers (name, is_active, import_instructions)
        VALUES ('Saran Enterprise Ltd', true, '{
            "sheet_name": "Sheet1",
            "header_row": 7,
            "mapping": {
                "name": "supplier_product_name",
                "pack_size": "pack_size / weight",
                "case_quantity": "case_quantity",
                "unit_price": "unit_price",
                "case_price": "case_price",
                "supplier_comment": "supplier_comment"
            },
            "special_rules": {
                "ignore_category_rows": true,
                "strict_format": true,
                "matching_priority": ["mapping", "barcode", "name_and_pack"]
            }
        }'::jsonb);
    END IF;
END $$;
