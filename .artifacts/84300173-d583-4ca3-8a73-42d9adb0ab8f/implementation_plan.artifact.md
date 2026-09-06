# Procurement and Backorder System Repair Plan

Repair and complete the existing procurement and backorder architecture in CentralHub.

## User Review Required

> [!IMPORTANT]
> The current system has `reserved_quantity` management disabled. I will re-enable it as per the requirement to calculate `available_stock = stock - reserved`.
>
> [!WARNING]
> I will add triggers to automatically populate `backorder_items` upon order payment. This is a behavioral change from the current "pull-only" model.

## Proposed Changes

### Database & Backend

#### [NEW] [procurement_system_v2.sql](file:///C:/Users/sruth/Downloads/Centralhub2708/project/supabase/migrations/20260827184500_procurement_system_v2.sql)
- Restore `reserved_quantity` logic in `central_inventory`.
- Define/Ensure `backorder_items` table with correct schema.
- Add `trg_order_items_backorder` to automatically create/update `backorder_items` when stock is insufficient during payment.
- Create `recompute_product_backorder` RPC for manual/automated refresh.
- Add `purchase_days` and `average_delivery_days` support to `suppliers`.

#### [MODIFY] [procurementService.ts](file:///C:/Users/sruth/Downloads/Centralhub2708/project/lib/services/procurementService.ts)
- Update `calculateProcurementPlan` to use `available_stock = stock - reserved`.
- Implement Requirement 6 (Supplier selection priority).
- Implement Requirement 8 (Purchase days logic).
- Add detailed reasoning and evidence to recommendations.

#### [MODIFY] [backorderService.ts](file:///C:/Users/sruth/Downloads/Centralhub2708/project/lib/services/backorderService.ts)
- Update `generatePlan` to fully leverage the new procurement engine.
- Ensure idempotency in `savePlan` and `createPODraft`.

#### [MODIFY] [orderService.ts](file:///C:/Users/sruth/Downloads/Centralhub2708/project/lib/services/orderService.ts)
- Re-enable `reserved_quantity` management in `createOrder` (reserve) and `confirmPayment` (commit/release).

### Frontend

#### [NEW] [ProcurementDashboard.tsx](file:///C:/Users/sruth/Downloads/Centralhub2708/project/app/procurement/ProcurementDashboard.tsx)
- Unified dashboard for Backorders, Recommendations, and PO Drafts.
- Responsive design for Samsung Galaxy Z Fold.

#### [MODIFY] [SuppliersSettingsClient.tsx](file:///C:/Users/sruth/Downloads/Centralhub2708/project/app/settings/master-data/suppliers/SuppliersSettingsClient.tsx)
- Add configuration for `purchase_days` and `average_delivery_days`.

#### [MODIFY] [SupplierPricingClient.tsx](file:///C:/Users/sruth/Downloads/Centralhub2708/project/app/suppliers/pricing/SupplierPricingClient.tsx)
- Enhance product-supplier mapping UI with MOQ, Pack Size, and Lead Time.

## Verification Plan

### Automated Tests
- Script to simulate Order → Backorder → Recommendation → PO Draft flow.
- Verify inventory math: `available = stock - reserved`.
- Verify pack size rounding and MOQ enforcement.
- Verify purchase day scheduling.

### Manual Verification
1. Create an order with quantity exceeding stock.
2. Verify `backorder_items` is created.
3. Run procurement engine and verify recommendation includes the backorder.
4. Verify PO Draft correctly groups by supplier and rounds to packs.
5. Receive stock and verify backorder is fulfilled.
