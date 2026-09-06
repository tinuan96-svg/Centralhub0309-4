# MalluSpices CentralHub EDI Compatibility Prompt

## Context

CentralHub is a multi-store order management system that syncs orders, products, and order items from multiple remote Supabase stores (MalluSpices, PocketGrocery, KeralaGrocery). It reads directly from your Supabase database using the service role key, so your database schema must match what CentralHub expects.

This document describes exactly what CentralHub reads and writes to your database, what fields it expects, what values are valid, and what you need to add or change to be fully compatible.

---

## 1. ORDERS TABLE

CentralHub reads from your `orders` table using `SELECT *` and upserts the mapped result into its own `orders` table. It also writes back order status updates TO your `orders` table when a status changes in CentralHub.

### Required columns in your `orders` table

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | Must be a valid UUID. CentralHub uses this as the primary key for syncing. |
| `order_number` | text | NOT NULL | Your store order number. CentralHub preserves its own internal number separately. |
| `customer_name` | varchar | NOT NULL | Falls back to "Guest" if null. |
| `customer_email` | varchar | NOT NULL | Falls back to "" if null. |
| `customer_phone` | varchar | NOT NULL | Falls back to "" if null. |
| `delivery_address` | text | NOT NULL | Falls back to "" if null. |
| `delivery_city` | text | NOT NULL | Falls back to "" if null. |
| `delivery_postcode` | text | NOT NULL | Falls back to "" if null. |
| `subtotal` | numeric | NOT NULL | If missing, CentralHub calculates as `total - delivery_fee`. |
| `delivery_fee` | numeric | NOT NULL | Falls back to 0. Also checks `shipping_cost` as an alias. |
| `total` | numeric | NOT NULL | Also checks `total_amount` as an alias. |
| `payment_method` | text | NOT NULL | Must be one of: `card`, `cod`, `paypal`, `wallet`. CentralHub maps `mollie` to `card`. Any unmapped value defaults to `card`. |
| `payment_status` | text | NOT NULL | Must be one of: `pending`, `paid`, `failed`, `refunded`. |
| `order_status` | varchar | NOT NULL | See status mapping below. Also checks `status` column as alias. |
| `created_at` | timestamptz | nullable | Used for ordering. |
| `updated_at` | timestamptz | nullable | Set on every update. |
| `store_id` | uuid | nullable | CentralHub overwrites this with its own store ID on sync. Do NOT set this yourself. |

### Order status values CentralHub recognizes

Your `order_status` (or `status`) column should use these values. CentralHub maps them on import:

| Your value | CentralHub value |
|---|---|
| `pending` | `pending_payment` |
| `confirmed` | `confirmed` |
| `processing` | `packing` |
| `picking` | `picking` |
| `packing` | `packing` |
| `packed` | `packed` |
| `ready_to_ship` | `ready_to_ship` |
| `shipment_booked` | `shipment_booked` |
| `shipped` | `shipped` |
| `out_for_delivery` | `out_for_delivery` |
| `delivered` | `delivered` |
| `completed` | `completed` |
| `cancelled` | `cancelled` |
| `refunded` | `refunded` |
| `paid` | `paid` |

Any unrecognized value defaults to `pending`.

### Reverse sync: CentralHub writes back to your orders table

When an order status changes in CentralHub, it pushes the update to your `orders` table with:

```sql
UPDATE orders SET order_status = $1, status = $1, updated_at = now() WHERE id = $2;
```

So your `orders` table MUST have a `status` column (or the update will fail on that column). If you do not have a `status` column, either add one or CentralHub will only update `order_status`.

---

## 2. ORDER ITEMS TABLE

CentralHub looks for order items in multiple table names in this order:

1. `order_items`
2. `line_items`
3. `items`
4. `ordered_products`
5. `woocommerce_order_items`

It uses whichever table returns data for the given order IDs. The table must have an `order_id` column that references the order UUID.

### Required columns in your order items table

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | If not a valid UUID, CentralHub generates a deterministic one. |
| `order_id` | uuid | NOT NULL | Must match the `id` in your `orders` table. |
| `product_id` | uuid | nullable | Should be a valid UUID matching your `products` table. If it starts with `CH-`, CentralHub maps it via `centralhub_product_id`. |
| `product_name` | text | NOT NULL | Also checks `name` as alias. Falls back to "Item". |
| `quantity` | integer | NOT NULL | Also checks `qty` as alias. Falls back to 1. |
| `unit_price` | numeric | NOT NULL | Also checks `price` as alias. Falls back to 0. |
| `total_price` | numeric | NOT NULL | Also checks `subtotal` as alias. Falls back to 0. |
| `cost_price` | numeric | nullable | Also checks `cost_price_at_order` as alias. |
| `brand` | text | nullable | Enriched from products table if missing on the item. |
| `weight` | text | nullable | Enriched from products table if missing. |
| `unit` | text | nullable | Enriched from products table if missing. |

CentralHub also reads items from a JSONB `items` or `line_items` column on the order itself, as a fallback. If your orders have items embedded as a JSON array, CentralHub will read those too.

---

## 3. PRODUCTS TABLE

CentralHub reads your `products` table to register products in its own catalog and to enrich order items with brand/weight/unit data.

### Required columns in your `products` table

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | Must be a valid UUID. Non-UUID products are skipped. |
| `name` | text | NOT NULL | Product display name. |
| `slug` | text | nullable | If missing, CentralHub generates one from the name. |
| `price` | numeric | NOT NULL | Falls back to 0. |
| `cost_price` | numeric | nullable | Used for profit calculations. Falls back to 0. |
| `brand` | text | nullable | Defaults to "Mallu Spices" if missing. |
| `category` | text | nullable | Your category string. |
| `weight` | text or numeric | nullable | Stored as text in CentralHub. |
| `unit` | text | nullable | e.g. "g", "kg", "ml", "L". |
| `centralhub_product_id` | text | nullable | If you use `CH-` prefixed IDs, this maps them to CentralHub UUIDs. |
| `is_active` | boolean | nullable | CentralHub sets this to true on sync. |

### Product webhook (CentralHub to MalluSpices)

CentralHub sends product updates to MalluSpices via a webhook. The webhook POSTs to your edge function with this payload:

```json
{
  "type": "INSERT" | "UPDATE" | "DELETE",
  "record": {
    "id": "uuid",
    "sku": "string",
    "name": "string",
    "slug": "string",
    "brand": "string",
    "brand_id": "string",
    "category": "string",
    "department": "string",
    "subcategory": "string",
    "price": 0,
    "sale_price": 0,
    "compare_at_price": 0,
    "stock": 0,
    "in_stock": true,
    "unit": "string",
    "weight": "string",
    "description": "string",
    "short_description": "string",
    "image_url": "string",
    "is_active": true,
    "is_published": true,
    "is_archived": false,
    "tags": [],
    "custom_attributes": {},
    "variants": [],
    "warehouse_location": "string",
    "gtin": "string",
    "updated_at": "2026-01-01T00:00:00Z"
  }
}
```

You need an edge function (e.g. `centralhub-realtime`) that accepts this webhook, validates the `x-webhook-secret` header, and upserts/deletes the product in your `products` table.

---

## 4. STORES TABLE (CentralHub side)

CentralHub has a `stores` table with these columns:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | e.g. "Mallu Spices" |
| `slug` | text | Must be `malluspices` (lowercase, no spaces) |
| `domain` | text | Your store domain |
| `visibility` | boolean | Whether the store is visible |
| `color` | text | Display color |
| `bucket_name` | text | Storage bucket name |
| `max_display_stock` | integer | Max stock to display |

CentralHub matches your store by slug. The slug `malluspices` is already configured. No action needed on your side unless you want to change the store name.

---

## 5. STORE_PRODUCTS TABLE (CentralHub side)

When CentralHub syncs your products, it also creates a `store_products` row linking each product to your store. This enables per-store product visibility. You do not need this table on your side.

---

## 6. ENVIRONMENT VARIABLES (CentralHub side)

CentralHub's edge functions use these environment variables to connect to your Supabase:

```
MALLUSPICES_SUPABASE_URL=https://your-project.supabase.co
MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

These are already configured in CentralHub. You need to provide your Supabase URL and service role key to the CentralHub operator.

For the reverse webhook (CentralHub pushing product updates to MalluSpices), you need to set:

```
CENTRALHUB_WEBHOOK_SECRET=your-shared-secret
```

This secret must match on both sides.

---

## 7. WHAT YOU NEED TO DO

### Step 1: Verify your `orders` table has all required columns

Check that your orders table has these columns. Add any missing ones:

```sql
-- Add missing columns (example)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name varchar NOT NULL DEFAULT 'Guest';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email varchar NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone varchar NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_postcode text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status varchar NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status varchar;  -- CentralHub writes to this on reverse sync
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
```

### Step 2: Ensure payment_status uses valid values

Your `payment_status` column must only contain: `pending`, `paid`, `failed`, `refunded`.

If you use different values (e.g. `unpaid`, `completed`, `processing`), create a migration to map them:

```sql
UPDATE orders SET payment_status = 'pending' WHERE payment_status IN ('unpaid', 'processing', 'awaiting_payment');
UPDATE orders SET payment_status = 'paid' WHERE payment_status IN ('completed', 'success', 'approved');
UPDATE orders SET payment_status = 'failed' WHERE payment_status IN ('declined', 'error', 'cancelled');
```

### Step 3: Ensure payment_method uses valid values

Your `payment_method` column must only contain: `card`, `cod`, `paypal`, `wallet`.

If you use `mollie`, it will be mapped to `card` automatically. If you use other values, map them:

```sql
UPDATE orders SET payment_method = 'card' WHERE payment_method IN ('mollie', 'stripe', 'credit_card', 'debit_card');
UPDATE orders SET payment_method = 'cod' WHERE payment_method IN ('cash_on_delivery', 'cash', 'cod');
```

### Step 4: Ensure order_status uses recognized values

Use the values from the mapping table in section 1. If you use WooCommerce-style statuses, map them:

```sql
UPDATE orders SET order_status = 'pending' WHERE order_status IN ('wc-pending', 'on-hold', 'awaiting_payment');
UPDATE orders SET order_status = 'confirmed' WHERE order_status IN ('wc-confirmed', 'accepted');
UPDATE orders SET order_status = 'processing' WHERE order_status IN ('wc-processing', 'in_progress');
UPDATE orders SET order_status = 'shipped' WHERE order_status IN ('wc-shipped', 'dispatched');
UPDATE orders SET order_status = 'delivered' WHERE order_status IN ('wc-delivered', 'wc-completed', 'completed');
UPDATE orders SET order_status = 'cancelled' WHERE order_status IN ('wc-cancelled', 'canceled');
UPDATE orders SET order_status = 'refunded' WHERE order_status IN ('wc-refunded');
```

### Step 5: Create or verify your order items table

If you do not have an `order_items` table, create one:

```sql
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  product_image text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  cost_price numeric,
  brand text,
  weight text,
  unit text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
```

### Step 6: Ensure your products table has the required columns

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS centralhub_product_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
```

### Step 7: Create the webhook receiver edge function

Create a Supabase edge function called `centralhub-realtime` that:

1. Accepts POST requests with CORS headers
2. Validates the `x-webhook-secret` header against your `CENTRALHUB_WEBHOOK_SECRET` env var
3. For `INSERT` and `UPDATE` type: upserts the product record into your `products` table
4. For `DELETE` type: deletes the product from your `products` table
5. Returns `{ ok: true }` on success

Example:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-webhook-secret, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const secret = req.headers.get("x-webhook-secret");
  const expectedSecret = Deno.env.get("CENTRALHUB_WEBHOOK_SECRET") ?? "";

  if (secret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const payload = await req.json();
  const { type, record } = payload;

  if (type === "DELETE") {
    await supabase.from("products").delete().eq("id", record.id);
  } else {
    await supabase.from("products").upsert({
      id: record.id,
      name: record.name,
      slug: record.slug,
      price: record.price,
      brand: record.brand,
      category: record.category,
      weight: record.weight,
      unit: record.unit,
      cost_price: record.cost_price,
      is_active: record.is_active ?? true,
      updated_at: record.updated_at || new Date().toISOString(),
    }, { onConflict: "id" });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

### Step 8: Set the webhook secret environment variable

In your Supabase project, set:

```
CENTRALHUB_WEBHOOK_SECRET=<a shared secret string>
```

Tell the CentralHub operator to set the same value so the webhook is authenticated.

---

## 8. SYNC BEHAVIOR SUMMARY

### CentralHub reads from MalluSpices (inbound sync)

- CentralHub connects to your Supabase using the service role key
- Reads orders (up to 1000 most recent, or a specific order by ID)
- Reads order items from `order_items` (or fallback table names)
- Reads products referenced by order items
- Upserts everything into CentralHub's database
- Preserves locally-confirmed payment/order status (does not overwrite if already set)

### CentralHub writes to MalluSpices (outbound sync)

- When an order status changes in CentralHub, it pushes the update to your `orders` table
- Updates both `order_status` and `status` columns
- When a product changes in CentralHub, it sends a webhook to your `centralhub-realtime` edge function

### What CentralHub does NOT do

- Does not create orders in your database (orders flow from you to CentralHub)
- Does not modify your products (unless via webhook, which you control)
- Does not read or write your customer/auth tables
- Does not manage your inventory (stock deductions happen in CentralHub only)

---

## 9. CHECKLIST

- [ ] `orders` table has all required columns with correct types
- [ ] `payment_status` only uses: `pending`, `paid`, `failed`, `refunded`
- [ ] `payment_method` only uses: `card`, `cod`, `paypal`, `wallet`
- [ ] `order_status` uses recognized values (see mapping table)
- [ ] `status` column exists on `orders` table (for reverse sync writes)
- [ ] `order_items` table exists with `order_id`, `product_id`, `product_name`, `quantity`, `unit_price`, `total_price`
- [ ] `products` table has `brand`, `cost_price`, `weight`, `unit`, `slug`, `is_active`, `centralhub_product_id` columns
- [ ] `centralhub-realtime` edge function deployed and accepting webhooks
- [ ] `CENTRALHUB_WEBHOOK_SECRET` env var set on both sides
- [ ] All existing order data migrated to use valid status values
