# Procurement Planning Engine Walkthrough

The CentralHub Backorder Planning has been upgraded to a full-scale Procurement Planning Engine.

## Key Enhancements

### 1. Unified Procurement Service
Created `procurementService.ts` as the central brain for replenishment logic. It calculates:
- **Net Stock**: Using `central_inventory.stock_quantity` (which reflects paid orders).
- **Backorder Debt**: Identifying exact quantities owed to customers.
- **Lead Time Demand**: Forecasting sales during the supplier's wait time.
- **Safety Stock**: Ensuring a buffer for high-velocity items.
- **14-day Coverage**: Target inventory levels for upcoming sales.
- **On PO Deductions**: Subtracting incoming stock from Draft POs and Supplier Invoices.

### 2. Supplier Intelligence
The engine now strictly respects:
- **Minimum Order Quantities (MOQ)**.
- **Pack Sizes / Case Quantities**: All recommendations are rounded up to the nearest full pack.
- **Lead Times**: Factored into the demand forecast.

### 3. Store-Specific Planning
The user can now scope the plan to a specific store (MalluSpices, KeralaGrocery, etc.). This filters:
- Customer order triggers.
- Existing PO drafts and invoices.
- Ensures POs created from the plan are assigned to the correct store.

### 4. Transparent Reasoning
Every recommendation now includes a detailed "Reasoning" field explaining exactly why the purchase is suggested (e.g., "12 units backordered, 20 units needed for lead time, 5 units already on PO").

### 5. Upgraded UI
The planning page features:
- **Priority Scoring**: Hot items move to the top.
- **Status Classification**: Color-coded labels (🔴 Buy Now, 🟠 Stockout Risk, etc.).
- **Detailed Table**: Showing Available, Backorder, On PO, Lead Time, and Forecast columns.
- **Interactive Details**: Click any row to see the demand analysis and supplier logic.

## Verification Results

### Procurement Engine
- **Backorder calculation**: ✅ PASS
- **Available stock calculation**: ✅ PASS
- **Reserved stock consideration**: ✅ PASS (Defaulted to demand if non-zero)
- **Supplier lead time**: ✅ PASS
- **MOQ & Pack Size**: ✅ PASS
- **Existing PO consideration**: ✅ PASS
- **Store-specific planning**: ✅ PASS

### Inventory Safety
- **Paid-order double counting**: ✅ PASS (Verified deduction flow)
- **Inventory deduction compatibility**: ✅ PASS
- **RLS & Database integrity**: ✅ PASS

### Deployment
- **TypeScript**: ✅ PASS
- **Lint**: ✅ PASS
- **Production build**: ✅ PASS
