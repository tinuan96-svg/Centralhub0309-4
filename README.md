# CentralHub

Modern, scalable ecommerce operations admin dashboard and product management system.

## Architecture

CentralHub owns the canonical product master in its own Supabase/PostgreSQL database. Each storefront has a separate database. Product changes propagate through the active database-level PostgreSQL sync path; CentralHub does not maintain a `store_products` assignment/override table.

## Product Architecture Rules

1. Never create or write to `store_products`.
2. Never use a store-product assignment/override layer for product propagation.
3. Manage canonical product data in `products`.
4. Manage canonical stock in `central_inventory`.
5. Preserve the active database-level direct product sync to connected store databases.
6. Use `centralhub_product_id` as the stable cross-database product identity where the store schema supports it.

## Core Operations

- Universal order queue across connected storefronts.
- Remote storefront order synchronization.
- Product, inventory, purchasing, fulfillment and shipping workflows.
- Financial and competitor analytics based on CentralHub master data.
- AI-powered product image processing.

## Getting Started

1. Install dependencies with `npm install`.
2. Configure `.env.local` with the Supabase URL and anon key.
3. Run `npm run dev` (Webpack is selected explicitly for the current WASM-only development environment).
4. Production builds use `npm run build`, which also selects Webpack explicitly.
5. Optional mobile commands: `npm run cap:sync` and `npm run cap:open`.
6. ESLint uses the Next.js 16 flat configuration in `eslint.config.mjs`.

## Security

- Row Level Security is enforced on Supabase tables.
- Role-based access distinguishes Admin and Staff roles.
- Inventory and operational changes are audited.

<!-- Architecture alignment: 2026-08-31 -->
<!-- Final cleanup trigger 2 -->
