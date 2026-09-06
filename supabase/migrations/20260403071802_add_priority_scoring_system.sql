/*
  # Add Priority Scoring System to AI Actions

  1. New Columns
    - `priority_score` (integer, 0-100) - Calculated priority score for actions
    - `stock_urgency` (integer, 0-100) - Stock urgency factor
    - `sales_velocity` (integer, 0-100) - Sales velocity factor
    - `revenue_impact` (integer, 0-100) - Revenue impact factor
    - `trend_factor` (integer, 0-100) - Trend factor
    - `manual_boost` (integer, 0-100) - Manual priority boost

  2. Changes
    - Add priority scoring columns to ai_actions table
    - Add index on priority_score for fast sorting
    - Set default values for new columns

  3. Notes
    - Priority score formula: (stock_urgency * 0.4) + (sales_velocity * 0.25) + (revenue_impact * 0.2) + (trend_factor * 0.1) + (manual_boost * 0.05)
    - Priority levels: 90+ = urgent, 70-89 = important, <70 = low
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_actions' AND column_name = 'priority_score'
  ) THEN
    ALTER TABLE ai_actions ADD COLUMN priority_score integer DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_actions' AND column_name = 'stock_urgency'
  ) THEN
    ALTER TABLE ai_actions ADD COLUMN stock_urgency integer DEFAULT 0 CHECK (stock_urgency >= 0 AND stock_urgency <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_actions' AND column_name = 'sales_velocity'
  ) THEN
    ALTER TABLE ai_actions ADD COLUMN sales_velocity integer DEFAULT 0 CHECK (sales_velocity >= 0 AND sales_velocity <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_actions' AND column_name = 'revenue_impact'
  ) THEN
    ALTER TABLE ai_actions ADD COLUMN revenue_impact integer DEFAULT 0 CHECK (revenue_impact >= 0 AND revenue_impact <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_actions' AND column_name = 'trend_factor'
  ) THEN
    ALTER TABLE ai_actions ADD COLUMN trend_factor integer DEFAULT 0 CHECK (trend_factor >= 0 AND trend_factor <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_actions' AND column_name = 'manual_boost'
  ) THEN
    ALTER TABLE ai_actions ADD COLUMN manual_boost integer DEFAULT 0 CHECK (manual_boost >= 0 AND manual_boost <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_actions_priority_score ON ai_actions(priority_score DESC);
