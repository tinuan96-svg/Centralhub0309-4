# CentralHub Schema Reference & Migration History

## Overview
This document provides a canonical reference for the CentralHub database schema and its migration history as of August 24, 2026.

## Canonical Tables

### Products (`public.products`)
- `id`: uuid (PK)
- `name`: text
- `sku`: text (Unique)
- `gtin`: text
- `price`: numeric
- `cost_price`: numeric
- `stock`: integer (LEGACY - synced from `central_inventory`)
- `is_active`: boolean
- `is_deleted`: boolean

### Central Inventory (`public.central_inventory`)
- **Source of Truth for stock levels.**
- `product_id`: uuid (PK, FK products.id)
- `stock_quantity`: integer
- `reserved_quantity`: integer
- `low_stock_threshold`: integer
- `last_audited_at`: timestamptz

### Inventory Movements (`public.inventory_movements`)
- **Enterprise Ledger for all stock changes.**
- `id`: uuid (PK)
- `product_id`: uuid (FK)
- `sku`: text
- `order_id`: uuid (FK)
- `change_amount`: integer
- `old_stock`: integer
- `new_stock`: integer
- `action_type`: text (DEDUCT, RESTORE, MANUAL, etc.)
- `reason`: text
- `source_store_id`: uuid (FK)

### Orders (`public.orders`)
- `id`: uuid (PK)
- `order_number`: text (Unique)
- `payment_status`: text (paid, unpaid, etc.)
- `order_status`: text (pending, confirmed, cancelled, refunded)
- `stock_deducted`: boolean (Idempotency flag)

## Key Functions

### `handle_order_inventory_movement()`
- Triggered BEFORE UPDATE on `orders`.
- Handles atomic deduction from `central_inventory` when an order is paid.
- Handles atomic restoration when an order is cancelled/refunded.
- Uses `stock_deducted` to ensure idempotency.

### `is_admin(user_id uuid)`
- Standard check for admin privileges used in RLS and API routes.

## Migration History Highlights

- `20260331...`: Initial ecommerce schema.
- `20260711...`: Automated inventory deduction system introduced.
- `20260816...`: Multi-store sync alignment.
- `20260824120000_inventory_stabilization.sql`: (LATEST) Stabilized inventory as canonical source and enforced idempotency.

## Deprecated Objects
- `products.stock`: Use `central_inventory.stock_quantity`.
- `inventory_logs`: Replaced by `inventory_movements` for enterprise-level tracking, though still exists for legacy support.
