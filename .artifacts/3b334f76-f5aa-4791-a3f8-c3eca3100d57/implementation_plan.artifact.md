# Procurement Planning Engine Integration

Upgrade the Backorder Planning system into a comprehensive Procurement Planning Engine that integrates real-time inventory, sales velocity, supplier intelligence, and existing purchase orders.

## User Review Required

> [!IMPORTANT]
> The engine uses `central_inventory.stock_quantity` as the "Net Stock" (already deducted by paid orders). This avoids double-counting unfulfilled paid orders. `reserved_quantity` will be factored in as additional demand if it is non-zero (currently it is mostly deprecated in the codebase).

## Proposed Changes

### Database & Schema

#### [MODIFY] [backorder_plan_items](file:///C:/Users/sruth/Downloads/Centralhub2108/project/supabase/migrations/20260813001214_add_backorder_planning_system.sql)
I will add columns to `backorder_plan_items` to store planning evidence (lead time demand, safety stock, etc.) if they don't exist. Actually, I'll create a new migration for this to be safe.

#### [NEW] [20260824160000_procurement_engine_evidence.sql](file:///C:/Users/sruth/Downloads/Centralhub2108/project/supabase/migrations/20260824160000_procurement_engine_evidence.sql)
Add columns to `backorder_plan_items` for better auditing:
- `lead_time_demand` (numeric)
- `safety_stock` (numeric)
- `forward_coverage_demand` (numeric)
- `backorder_debt` (numeric)
- `on_po_quantity` (numeric)
- `reasoning` (text)

---

### Services

#### [NEW] [procurementService.ts](file:///C:/Users/sruth/Downloads/Centralhub2108/project/lib/services/procurementService.ts)
Implement the core logic for the Procurement Planning Engine:
- `calculateProcurementPlan(storeId?: string)`: Main engine function.
- Fetch unfulfilled paid orders (to show as triggers).
- Fetch `central_inventory` (stock and reserved).
- Fetch `product_suppliers` (preferred supplier, MOQ, pack size, lead time).
- Fetch "On PO" quantities from `po_drafts` and `supplier_invoices`.
- Calculate demand based on sales velocity (optionally store-specific).
- Apply procurement formulas.

#### [MODIFY] [backorderService.ts](file:///C:/Users/sruth/Downloads/Centralhub2108/project/lib/services/backorderService.ts)
I might deprecate this or refactor it to use `procurementService.ts`.

---

### UI Components

#### [MODIFY] [page.tsx](file:///C:/Users/sruth/Downloads/Centralhub2108/project/app/backorder-planning/page.tsx)
- Rename page title to "Procurement Planning".
- Update table to show new columns: Available, Backorder, On PO, Lead Time, Forecast, Recommended.
- Add classification labels (🔴 Buy Now, 🟠 Stockout Risk, etc.).
- Add explanation tooltip/row for each recommendation.
- Implement sorting and filtering.

## Verification Plan

### Automated Tests
- Run `npm run lint` and `npx tsc --noEmit` to ensure type safety.
- Create a test script in `.artifacts/scratch/test_procurement_logic.ts` to verify the formulas with mock data.

### Manual Verification
- Generate a plan and verify the "Reason" explains the calculation correctly.
- Verify that changing the Store filter updates the Sales Velocity and triggers correctly.
- Verify that "On PO" quantities are correctly deducted from the recommendation.
- Verify that MOQ and Pack Size are respected.
