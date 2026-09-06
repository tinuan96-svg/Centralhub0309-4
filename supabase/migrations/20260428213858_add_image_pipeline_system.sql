/*
  # Image Processing Pipeline

  ## Summary
  Creates the infrastructure for an automated AI image processing pipeline.
  When a product image is uploaded, a pipeline job is created, the image is
  processed (background removal, enhancement, standardisation), and the results
  are stored in a structured bucket with WebP + JPEG outputs.

  ## New Tables
  - `image_pipeline_jobs`
    - Tracks every processing job: status, source file, output paths, error info
    - Statuses: pending | processing | completed | failed | skipped

  ## Modified Tables
  - `products`
    - `processed_webp_url`  — primary processed image (WebP)
    - `processed_jpeg_url`  — JPEG fallback
    - `processed_thumb_url` — 300x300 thumbnail WebP
    - `processed_listing_url` — 800x800 listing WebP
    - `image_processed_at` — timestamp of last successful processing
    - `image_pipeline_status` — latest pipeline status for this product

  ## Security
  - RLS enabled on image_pipeline_jobs
  - Only authenticated users can read/write pipeline jobs
*/

-- 1. image_pipeline_jobs table
CREATE TABLE IF NOT EXISTS image_pipeline_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid REFERENCES products(id) ON DELETE CASCADE,
  source_url          text NOT NULL,
  source_bucket       text NOT NULL DEFAULT 'product-images',
  source_filename     text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  -- output paths (relative filenames inside product-images-processed bucket)
  output_webp         text,
  output_jpeg         text,
  output_thumb        text,
  output_listing      text,
  -- ai processing flags
  bg_removed          boolean NOT NULL DEFAULT false,
  enhanced            boolean NOT NULL DEFAULT false,
  -- metadata
  error_message       text,
  processing_ms       integer,
  ai_provider         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  triggered_by        text DEFAULT 'upload'  -- 'upload' | 'manual' | 'retry'
);

CREATE INDEX IF NOT EXISTS idx_image_pipeline_jobs_product_id ON image_pipeline_jobs(product_id);
CREATE INDEX IF NOT EXISTS idx_image_pipeline_jobs_status ON image_pipeline_jobs(status);
CREATE INDEX IF NOT EXISTS idx_image_pipeline_jobs_created_at ON image_pipeline_jobs(created_at DESC);

ALTER TABLE image_pipeline_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pipeline jobs"
  ON image_pipeline_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pipeline jobs"
  ON image_pipeline_jobs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update pipeline jobs"
  ON image_pipeline_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pipeline jobs"
  ON image_pipeline_jobs FOR DELETE TO authenticated USING (true);

-- 2. Add processed image columns to products
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='processed_webp_url') THEN
    ALTER TABLE products ADD COLUMN processed_webp_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='processed_jpeg_url') THEN
    ALTER TABLE products ADD COLUMN processed_jpeg_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='processed_thumb_url') THEN
    ALTER TABLE products ADD COLUMN processed_thumb_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='processed_listing_url') THEN
    ALTER TABLE products ADD COLUMN processed_listing_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='image_processed_at') THEN
    ALTER TABLE products ADD COLUMN image_processed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='image_pipeline_status') THEN
    ALTER TABLE products ADD COLUMN image_pipeline_status text DEFAULT 'none'
      CHECK (image_pipeline_status IN ('none', 'pending', 'processing', 'completed', 'failed', 'skipped'));
  END IF;
END $$;
