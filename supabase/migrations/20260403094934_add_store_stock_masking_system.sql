/*
  # Add Store-Level Stock Masking System

  1. Changes
    - Add `max_display_stock` column to `stores` table
      - INTEGER type with DEFAULT 5
      - Controls maximum stock displayed on store frontend
      - Helps prevent Google duplicate content detection
  
  2. Purpose
    - Display limited stock per store while keeping real stock centralized
    - Real stock: central_inventory.stock_quantity
    - Store limit: stores.max_display_stock
    - Display stock: LEAST(real_stock, store_limit)
    - If real_stock < 5: show real stock (no masking)
  
  3. Business Logic
    - KG store might set max_display_stock = 5
    - PG store might set max_display_stock = 10
    - Makes stores look independent to search engines
    - Real inventory remains accurate in central system
*/

-- Add max_display_stock column to stores table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'max_display_stock'
  ) THEN
    ALTER TABLE stores ADD COLUMN max_display_stock INTEGER DEFAULT 5;
  END IF;
END $$;

-- Add comment to document the column
COMMENT ON COLUMN stores.max_display_stock IS 'Maximum stock quantity to display on store frontend. Used for stock masking to prevent duplicate content detection. Real stock is maintained in central inventory.';
