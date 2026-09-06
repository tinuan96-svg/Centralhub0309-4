-- Seed Gateways for Malluspices and Keralagrocery

DO $$
DECLARE
    v_mallu_id uuid;
    v_kerala_id uuid;
    v_mollie_id uuid;
    v_trust_id uuid;
BEGIN
    -- 1. Get Store IDs
    SELECT id INTO v_mallu_id FROM stores WHERE slug = 'malluspices' LIMIT 1;
    SELECT id INTO v_kerala_id FROM stores WHERE slug = 'keralagrocery' OR slug = 'keralagroceries' LIMIT 1;

    -- 2. Create Mollie for Malluspices
    IF v_mallu_id IS NOT NULL THEN
        INSERT INTO public.payment_gateways (store_id, gateway_name, settlement_cycle_days)
        VALUES (v_mallu_id::text, 'Mollie', 2)
        ON CONFLICT (store_id, gateway_name) DO UPDATE SET settlement_cycle_days = 2
        RETURNING id INTO v_mollie_id;

        -- Create Fee Rule: 1.8% + £0.20
        INSERT INTO public.gateway_fee_rules (gateway_id, payment_method, fee_type, percentage_fee, fixed_fee)
        VALUES (v_mollie_id, 'card', 'mixed', 1.80, 0.20)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 3. Create Trust Payments for Keralagrocery
    IF v_kerala_id IS NOT NULL THEN
        INSERT INTO public.payment_gateways (store_id, gateway_name, settlement_cycle_days)
        VALUES (v_kerala_id::text, 'Trust Payments', 3)
        ON CONFLICT (store_id, gateway_name) DO UPDATE SET settlement_cycle_days = 3
        RETURNING id INTO v_trust_id;

        -- Create Fee Rule: 2.0% + £0.20
        INSERT INTO public.gateway_fee_rules (gateway_id, payment_method, fee_type, percentage_fee, fixed_fee)
        VALUES (v_trust_id, 'card', 'mixed', 2.00, 0.20)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
