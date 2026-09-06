/*
  # Shipping Management System

  Production-ready shipping system with DHL eCommerce UK integration.
  Supports multi-carrier extensibility, tracking, label generation, and cost management.

  ## 1. New Tables

  ### shipments
  - `id` (uuid, primary key)
  - `order_id` (uuid, foreign key to orders)
  - `carrier` (text, default 'dhl', extensible to other carriers)
  - `service_type` (text, standard/express/priority)
  - `tracking_number` (text, unique, nullable)
  - `label_url` (text, nullable, PDF label URL)
  - `status` (text, not_shipped/label_created/in_transit/delivered/failed/cancelled)
  - `shipping_cost` (integer, cost in pence)
  - `weight_grams` (integer, package weight)
  - `sender_name` (text)
  - `sender_address` (text)
  - `sender_city` (text)
  - `sender_postcode` (text)
  - `sender_phone` (text)
  - `recipient_name` (text)
  - `recipient_address` (text)
  - `recipient_city` (text)
  - `recipient_postcode` (text)
  - `recipient_phone` (text)
  - `recipient_email` (text, nullable)
  - `carrier_reference` (text, nullable, DHL shipment ID)
  - `estimated_delivery` (timestamp, nullable)
  - `actual_delivery` (timestamp, nullable)
  - `label_printed` (boolean, default false)
  - `error_message` (text, nullable)
  - `metadata` (jsonb, carrier-specific data)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

  ### shipment_events
  - `id` (uuid, primary key)
  - `shipment_id` (uuid, foreign key)
  - `status` (text)
  - `location` (text, nullable)
  - `description` (text)
  - `event_time` (timestamp)
  - `metadata` (jsonb, carrier event data)
  - `created_at` (timestamp)

  ### shipping_rates_cache
  - `id` (uuid, primary key)
  - `carrier` (text)
  - `service_type` (text)
  - `from_postcode` (text)
  - `to_postcode` (text)
  - `weight_grams` (integer)
  - `cost` (integer, cost in pence)
  - `expires_at` (timestamp)
  - `created_at` (timestamp)

  ### sender_profiles
  - `id` (uuid, primary key)
  - `name` (text, profile name)
  - `company_name` (text)
  - `contact_name` (text)
  - `address_line1` (text)
  - `address_line2` (text, nullable)
  - `city` (text)
  - `postcode` (text)
  - `country` (text, default 'GB')
  - `phone` (text)
  - `email` (text)
  - `is_default` (boolean, default false)
  - `site` (text, nullable, for multi-brand)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

  ## 2. Security
  - Enable RLS on all tables
  - Authenticated users can manage all shipping data

  ## 3. Indexes
  - Performance indexes for shipment queries
  - Indexes on tracking numbers and statuses
*/

-- Shipments Table
CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  carrier text NOT NULL DEFAULT 'dhl',
  service_type text NOT NULL DEFAULT 'standard' CHECK (service_type IN ('standard', 'express', 'priority')),
  tracking_number text UNIQUE,
  label_url text,
  status text NOT NULL DEFAULT 'not_shipped' CHECK (status IN ('not_shipped', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'cancelled', 'returned')),
  shipping_cost integer DEFAULT 0,
  weight_grams integer NOT NULL,
  sender_name text NOT NULL,
  sender_address text NOT NULL,
  sender_city text NOT NULL,
  sender_postcode text NOT NULL,
  sender_phone text NOT NULL,
  recipient_name text NOT NULL,
  recipient_address text NOT NULL,
  recipient_city text NOT NULL,
  recipient_postcode text NOT NULL,
  recipient_phone text NOT NULL,
  recipient_email text,
  carrier_reference text,
  estimated_delivery timestamptz,
  actual_delivery timestamptz,
  label_printed boolean DEFAULT false,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Shipment Events Table
CREATE TABLE IF NOT EXISTS shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  status text NOT NULL,
  location text,
  description text NOT NULL,
  event_time timestamptz NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Shipping Rates Cache Table
CREATE TABLE IF NOT EXISTS shipping_rates_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier text NOT NULL,
  service_type text NOT NULL,
  from_postcode text NOT NULL,
  to_postcode text NOT NULL,
  weight_grams integer NOT NULL,
  cost integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Sender Profiles Table
CREATE TABLE IF NOT EXISTS sender_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  postcode text NOT NULL,
  country text NOT NULL DEFAULT 'GB',
  phone text NOT NULL,
  email text NOT NULL,
  is_default boolean DEFAULT false,
  site text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_rates_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view shipments"
  ON shipments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert shipments"
  ON shipments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update shipments"
  ON shipments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shipments"
  ON shipments FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view shipment events"
  ON shipment_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert shipment events"
  ON shipment_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view rates cache"
  ON shipping_rates_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert rates cache"
  ON shipping_rates_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view sender profiles"
  ON sender_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sender profiles"
  ON sender_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sender profiles"
  ON sender_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete sender profiles"
  ON sender_profiles FOR DELETE
  TO authenticated
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_carrier ON shipments(carrier);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_events_event_time ON shipment_events(event_time DESC);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_cache_lookup ON shipping_rates_cache(carrier, service_type, from_postcode, to_postcode, weight_grams);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_cache_expires ON shipping_rates_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_sender_profiles_default ON sender_profiles(is_default);
CREATE INDEX IF NOT EXISTS idx_sender_profiles_site ON sender_profiles(site);

-- Insert Default Sender Profile
INSERT INTO sender_profiles (
  name, 
  company_name, 
  contact_name, 
  address_line1, 
  city, 
  postcode, 
  phone, 
  email, 
  is_default
) VALUES (
  'Default Warehouse',
  'CentralHub Ltd',
  'Warehouse Manager',
  '123 Business Park',
  'London',
  'E1 6AN',
  '+442012345678',
  'shipping@centralhub.com',
  true
) ON CONFLICT DO NOTHING;
