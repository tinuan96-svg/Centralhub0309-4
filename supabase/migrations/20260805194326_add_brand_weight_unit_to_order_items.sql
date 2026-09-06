-- Add brand, weight, unit columns to order_items table
ALTER TABLE order_items 
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS weight text,
  ADD COLUMN IF NOT EXISTS unit text;