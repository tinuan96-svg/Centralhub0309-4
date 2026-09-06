-- Fix order status defaults and existing invalid values that cause update failures
-- Root cause: 'pending' is no longer a valid fulfillment_status but was still used as a default or in existing records.

-- 1. Fix existing invalid fulfillment_status values
UPDATE public.orders
SET fulfillment_status = 'pending_payment'
WHERE fulfillment_status = 'pending';

-- 2. Update default value for fulfillment_status to be valid
ALTER TABLE public.orders ALTER COLUMN fulfillment_status SET DEFAULT 'pending_payment';

-- 3. Ensure order_status also has a valid default
ALTER TABLE public.orders ALTER COLUMN order_status SET DEFAULT 'pending_payment';

-- 4. Fix any existing invalid order_status values (just in case)
UPDATE public.orders
SET order_status = 'pending_payment'
WHERE order_status = 'pending';

-- 5. Sync fulfillment_status with order_status for confirmed orders
UPDATE public.orders
SET fulfillment_status = 'confirmed'
WHERE order_status = 'confirmed' AND fulfillment_status = 'pending_payment';
