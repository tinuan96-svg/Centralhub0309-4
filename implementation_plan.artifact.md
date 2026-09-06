# Brand and Category Intelligence Transformation Plan

This plan outlines the multi-phase transformation of the Brands and Categories sections into advanced business intelligence and analytics pages, utilizing real transactional data from all connected stores.

## Phase 1: Audit & Data Layer Expansion

### Existing Data Relationships (Verified)
- **Brands**: `brands` table (id, name, slug, logo_url, is_active).
- **Categories**: `categories` table (id, name, slug, parent_id, sort_order, is_active).
- **Products**: `products` table (id, name, sku, gtin, price, cost_price, brand_id, category_id, is_active, is_deleted).
- **Orders**: `orders` table (id, order_number, store_id, payment_status, order_status, total, delivery_fee, created_at).
- **Order Items**: `order_items` table (id, order_id, product_id, quantity, unit_price, total_price, cost_price).
- **Inventory**: `central_inventory` table (product_id, stock_quantity, low_stock_threshold).
- **Stores**: `stores` table (id, name, slug).

### Proposed Changes: Intelligence Service
Create [intelligenceService.ts](file:///C:/Users/sruth/Downloads/Centralhub2108/project/lib/services/intelligenceService.ts) to handle complex aggregations.

#### [NEW] [intelligenceService.ts](file:///C:/Users/sruth/Downloads/Centralhub2108/project/lib/services/intelligenceService.ts)
- `getBrandAnalytics(options: FilterOptions)`: Aggregates metrics for all brands.
- `getBrandDetailAnalytics(brandId: string, options: FilterOptions)`: Detailed metrics, trends, and product performance for a specific brand.
- `getCategoryAnalytics(options: FilterOptions)`: Aggregates metrics for all categories.
- `getCategoryDetailAnalytics(categoryId: string, options: FilterOptions)`: Detailed metrics, trends, and subcategory/brand breakdown.
- `getTrendData(entityId: string, type: 'brand' | 'category', options: FilterOptions)`: Time-series data for revenue, units, profit.
- `getQualitativeInsights(metrics: any)`: Logic-based interpretation of quantitative data.

---

## Phase 2: Brand Intelligence Transformation

### Brand Listing Upgrade
- Transform [app/settings/master-data/brands/page.tsx](file:///C:/Users/sruth/Downloads/Centralhub2108/project/app/settings/master-data/brands/page.tsx) into a high-level dashboard.
- Display cards with Sparklines, Revenue, Units Sold, and Margin for each brand.
- Add Global Filters (Store, Date Range).

### Brand Detail Analytics Page
- Create [app/settings/master-data/brands/[id]/page.tsx](file:///C:/Users/sruth/Downloads/Centralhub2108/project/app/settings/master-data/brands/[id]/page.tsx).
- **KPI Row**: Total Revenue, Units Sold, Gross Profit, Avg Margin, Stock Value.
- **Sales Trend**: Canvas-based line chart switching between Revenue/Units/Profit.
- **Top/Bottom Products**: Ranked lists based on selectable metrics.
- **Store Comparison**: Performance breakdown by connected store.
- **Category Distribution**: Distribution of brand sales across categories.
- **Qualitative Insights**: AI-style interpretation of brand performance.

---

## Phase 3: Category Intelligence Transformation

### Category Listing Upgrade
- Transform [app/settings/master-data/categories/page.tsx](file:///C:/Users/sruth/Downloads/Centralhub2108/project/app/settings/master-data/categories/page.tsx).
- Display category performance metrics (Revenue, Profit, Inventory Health).

### Category Detail Analytics Page
- Create [app/settings/master-data/categories/[id]/page.tsx](file:///C:/Users/sruth/Downloads/Centralhub2108/project/app/settings/master-data/categories/[id]/page.tsx).
- **KPI Row**: Revenue, Units, Profit, Subcategory count, Active Products.
- **Sales Trend**: Trend analysis for the category.
- **Brand Contribution**: Horizontal bar chart showing which brands drive the category.
- **Subcategory Breakdown**: Depth-analysis of subcategory performance.
- **Product Sales Heatmap**: Heatmap visualization of product performance within the category.

---

## Phase 4: Qualitative Analysis & Management Recommendations

### Intelligence Engine Logic
Implement interpretation logic in the service layer:
- **Stars**: High sales + high margin.
- **Volume Drivers**: High sales + low margin.
- **Inventory Risks**: High sales + low stock.
- **Dead Stock**: High stock + no sales (considering product age).
- **Recommended Actions**: Actionable items like "Increase stock", "Review pricing", "Discontinue".

---

## Phase 5: UI/UX & Refinement

- **Global Filter Sync**: Ensure filters update all components in real-time.
- **Responsive Design**: Optimization for mobile and tablet views.
- **Data Quality Alerts**: Detection of products with missing brands, categories, or costs.
- **Export Functionality**: CSV/Excel export for filtered analytics reports.

## Verification Plan

### Automated Tests
- Create a script `scripts/verify-intelligence-totals.ts` to reconcile aggregated intelligence data against raw order_items and orders.
- Validate that Brand Revenue sum equals Total Validated Revenue.

### Manual Verification
- Verify that filtering by "Today" or "7 Days" correctly updates trends.
- Verify store-specific comparisons against actual store orders.
- Check qualitative insights against the numbers shown (e.g. if margin is low, a warning should appear).
