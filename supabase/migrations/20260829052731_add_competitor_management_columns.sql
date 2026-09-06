/*
# Add competitor management columns

1. Purpose
   The competitors table currently lacks columns needed for the competitor
   intelligence UI: active/inactive status, scan frequency, last successful
   scan timestamp, and last scan status. These are required for the Overview
   tab to show scan health and scheduling information.

2. Changes to existing table `competitors`
   - `is_active` (boolean, default true) — whether the competitor is being monitored
   - `scan_frequency` (text, default 'daily') — how often to scan: manual_only, every_6_hours, daily, every_2_days, weekly
   - `last_successful_scan_at` (timestamptz, nullable) — most recent successful scan
   - `last_scan_status` (text, nullable) — success/failed/discovering
   - `last_scan_at` (timestamptz, nullable) — most recent scan attempt (any status)

3. Security
   No new tables. RLS already exists on competitors. No policy changes needed.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competitors' AND column_name='is_active') THEN
    ALTER TABLE competitors ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competitors' AND column_name='scan_frequency') THEN
    ALTER TABLE competitors ADD COLUMN scan_frequency text NOT NULL DEFAULT 'daily';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competitors' AND column_name='last_successful_scan_at') THEN
    ALTER TABLE competitors ADD COLUMN last_successful_scan_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competitors' AND column_name='last_scan_status') THEN
    ALTER TABLE competitors ADD COLUMN last_scan_status text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competitors' AND column_name='last_scan_at') THEN
    ALTER TABLE competitors ADD COLUMN last_scan_at timestamptz;
  END IF;
END $$;
