# CentralHub - Manual Testing Checklist

Use this checklist to manually verify all system functionality.

---

## PRE-FLIGHT CHECKS

### 1. Application Starts
- [ ] Run `npm run dev`
- [ ] Navigate to http://localhost:3000
- [ ] No console errors in browser
- [ ] UI renders correctly

### 2. Database Connection
- [ ] Supabase connection active
- [ ] Can fetch data from tables
- [ ] No authentication errors

---

## CORE FUNCTIONALITY TESTS

### PRODUCT MANAGEMENT

#### Test 1: View Products
1. [ ] Navigate to `/` (Products page)
2. [ ] Products table loads with data
3. [ ] Product images display correctly
4. [ ] Prices show in correct format (£X.XX)

#### Test 2: Store Switching
1. [ ] Click store dropdown in top bar
2. [ ] Select different store
3. [ ] Product data refreshes
4. [ ] Overridden products show badge
5. [ ] Prices update correctly

#### Test 3: Product Override
1. [ ] Click "Edit" on any product
2. [ ] Modal opens with product details
3. [ ] Switch to different store
4. [ ] Enter price override
5. [ ] Save changes
6. [ ] Verify override badge appears
7. [ ] Switch stores and verify price changes

**Expected Result:** ✅ Store overrides work correctly

---

### INVENTORY MANAGEMENT

#### Test 4: View Inventory
1. [ ] Navigate to `/inventory`
2. [ ] Inventory table loads
3. [ ] Shows: Product, Stock, Reserved, Available, Threshold
4. [ ] Stock badges show correct colors:
   - Red = Out of Stock (available = 0)
   - Orange = Low Stock (available <= threshold)
   - Green = OK (available > threshold)

#### Test 5: Update Stock
1. [ ] Click any product row
2. [ ] Enter new stock quantity
3. [ ] Click "Update Stock"
4. [ ] Verify quantity changes immediately
5. [ ] Check "Available" recalculates (stock - reserved)

#### Test 6: Stock Reservation (via Orders)
1. [ ] Navigate to `/orders`
2. [ ] Check an order with "pending" status
3. [ ] Note the products and quantities
4. [ ] Go to `/inventory`
5. [ ] Verify "Reserved" quantity matches order items

**Expected Result:** ✅ Inventory tracks stock correctly

---

### PRICING ENGINE

#### Test 7: View Pricing Rules
1. [ ] Navigate to `/pricing`
2. [ ] Rules table loads
3. [ ] Shows: Name, Type, Value, Priority, Status

#### Test 8: Create Pricing Rule
1. [ ] Click "Create Rule"
2. [ ] Select store/category/product
3. [ ] Choose type (Percentage or Fixed)
4. [ ] Enter value (e.g., 10 for 10%)
5. [ ] Set priority (e.g., 100)
6. [ ] Save rule

#### Test 9: Price Breakdown
1. [ ] Go to Products page
2. [ ] Click "View Breakdown" on any product
3. [ ] Modal shows:
   - Base price
   - Store override (if any)
   - Applied rules (in priority order)
   - Final price
4. [ ] Verify calculation is correct

**Formula:**
```
Start: base_price = products.price
If override exists: price = store_products.price_override
For each active rule (priority DESC):
  If percentage: price = price * (1 + value/100)
  If fixed: price = price + value
Final: final_price
```

**Expected Result:** ✅ Pricing rules apply correctly

---

### ORDER & INVENTORY SYNC

#### Test 10: Create Order (Manual DB)
1. [ ] Use Supabase dashboard or SQL
2. [ ] Insert order with status = 'pending'
3. [ ] Insert order_items with products
4. [ ] Check inventory - reserved should increase

#### Test 11: Order Status Change
1. [ ] Update order status to 'shipped'
2. [ ] Check inventory:
   - Stock quantity should decrease
   - Reserved quantity should decrease
   - Available stays correct

#### Test 12: Cancel Order
1. [ ] Update order status to 'cancelled'
2. [ ] Check inventory:
   - Reserved quantity should decrease to 0
   - Stock quantity stays same
   - Available increases

**Expected Result:** ✅ Inventory syncs automatically

---

## AI INSIGHTS ENGINE TESTS

### TEST 13: Access Dashboard
1. [ ] Navigate to `/dashboard`
2. [ ] Page loads without errors
3. [ ] Business metrics display:
   - Total Products
   - Total Orders
   - Total Revenue
   - Out of Stock count
   - Low Stock count
   - Pending Orders
4. [ ] AI Insights panel visible on right

**Expected Result:** ✅ Dashboard displays correctly

### TEST 14: Generate Insights
1. [ ] Click "Analyze Now" button
2. [ ] Loading spinner appears
3. [ ] Wait for analysis to complete
4. [ ] Insights appear in panel
5. [ ] Check for different types:
   - 📦 Stock insights (low stock, out of stock, overstocked)
   - 📈 Sales insights (slow moving, high demand)
   - 💰 Pricing insights (price variance)
   - 🔍 Anomaly insights (order spikes)

**Expected Result:** ✅ AI generates relevant insights

### TEST 15: Filter Insights
1. [ ] Click "Critical" filter button
2. [ ] Only critical severity insights show
3. [ ] Click "High" filter button
4. [ ] Only high severity insights show
5. [ ] Click "All" to reset

**Expected Result:** ✅ Filtering works correctly

### TEST 16: View Insight Details
1. [ ] Examine an insight card
2. [ ] Verify it shows:
   - Severity icon (🚨 ⚠️ 📊 ℹ️)
   - Type icon (📦 📈 💰 🔍)
   - Title
   - Message
   - Additional data
3. [ ] Read the message - should be actionable

**Expected Result:** ✅ Insights are clear and informative

### TEST 17: Review Suggested Actions
1. [ ] Scroll to "Suggested Actions" section
2. [ ] Each action should show:
   - Action icon (📈 📉 📦 ❌ ⭐)
   - Title (e.g., "Restock Product X")
   - Description
   - Current → Suggested values
   - "Apply" button
   - "Dismiss" button

**Expected Result:** ✅ Actions are clear and actionable

### TEST 18: Execute Restock Action
1. [ ] Find a "Restock" action
2. [ ] Note the suggested quantity
3. [ ] Click "Apply"
4. [ ] Confirm in dialog
5. [ ] Wait for success message
6. [ ] Navigate to `/inventory`
7. [ ] Verify stock increased by suggested amount
8. [ ] Go back to `/dashboard`
9. [ ] Verify action disappeared from pending list

**Expected Result:** ✅ Restock action executes correctly

### TEST 19: Execute Price Change Action
1. [ ] Find a "Discount" or "Optimize pricing" action
2. [ ] Note current and suggested price
3. [ ] Click "Apply"
4. [ ] Confirm in dialog
5. [ ] Navigate to `/` (Products)
6. [ ] Find the product
7. [ ] Verify price changed to suggested value

**Expected Result:** ✅ Price change executes correctly

### TEST 20: Dismiss Insight
1. [ ] Click "✕" on any insight card
2. [ ] Insight disappears immediately
3. [ ] Refresh page
4. [ ] Verify insight stays dismissed

**Expected Result:** ✅ Dismiss works correctly

### TEST 21: Reject Action
1. [ ] Find any suggested action
2. [ ] Click "Dismiss" button
3. [ ] Action disappears
4. [ ] Click "Analyze Now" again
5. [ ] Verify action doesn't reappear

**Expected Result:** ✅ Reject works correctly

---

## EDGE CASE TESTS

### TEST 22: Product Without Inventory
1. [ ] Create new product (or find one)
2. [ ] Don't add to central_inventory
3. [ ] View product on Products page
4. [ ] Should display correctly
5. [ ] Run AI analysis
6. [ ] Should not crash

**Expected Result:** ✅ Handles missing inventory gracefully

### TEST 23: Product Without Store Override
1. [ ] Select any store
2. [ ] View product with no override
3. [ ] Should show base price
4. [ ] No override badge visible

**Expected Result:** ✅ Falls back to base values

### TEST 24: Reserve More Than Available
1. [ ] Find product with 5 units available
2. [ ] Try to create order with 10 units
3. [ ] Should fail validation
4. [ ] Reserved quantity should not change

**Expected Result:** ✅ Prevents over-reservation

### TEST 25: Multiple Pricing Rules (Same Product)
1. [ ] Create 3 rules for same product
2. [ ] Set different priorities: 100, 50, 10
3. [ ] View price breakdown
4. [ ] Rules should apply in order: 100 → 50 → 10

**Expected Result:** ✅ Priority order respected

### TEST 26: Empty Dashboard
1. [ ] If no insights exist yet
2. [ ] Should show empty state message
3. [ ] "Analyze Now" button visible
4. [ ] No errors in console

**Expected Result:** ✅ Empty states handled

### TEST 27: Large Dataset
1. [ ] Run AI analysis with 100+ products
2. [ ] Should complete without timeout
3. [ ] UI should remain responsive
4. [ ] Insights should load paginated/limited

**Expected Result:** ✅ Performs well with scale

---

## DATA INTEGRITY VERIFICATION

### TEST 28: Stock Constraints
Run this SQL in Supabase:

```sql
SELECT
  product_id,
  stock_quantity,
  reserved_quantity
FROM central_inventory
WHERE stock_quantity < 0
   OR reserved_quantity < 0
   OR reserved_quantity > stock_quantity;
```

**Expected Result:** 0 rows (no violations)

### TEST 29: Price Validity
Run this SQL:

```sql
SELECT id, name, price
FROM products
WHERE price < 0 OR price IS NULL;
```

**Expected Result:** 0 rows (all prices valid)

### TEST 30: Order Totals
Run this SQL:

```sql
SELECT
  o.id,
  o.total,
  SUM(oi.total_price) as calculated_total
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.total
HAVING o.total != SUM(oi.total_price);
```

**Expected Result:** 0 rows (all totals match)

---

## PERFORMANCE TESTS

### TEST 31: Page Load Speed
1. [ ] Open DevTools Network tab
2. [ ] Navigate to each page
3. [ ] Measure load time
4. [ ] Expected: < 2 seconds per page

### TEST 32: AI Analysis Speed
1. [ ] Click "Analyze Now"
2. [ ] Time how long it takes
3. [ ] Expected: < 5 seconds for 100 products

### TEST 33: No N+1 Queries
1. [ ] Open Supabase logs
2. [ ] Load Products page
3. [ ] Check query count
4. [ ] Expected: 1-2 queries, not N queries for N products

---

## UI/UX TESTS

### TEST 34: Responsive Design
1. [ ] Resize browser to mobile width (375px)
2. [ ] All pages should adapt
3. [ ] No horizontal scroll
4. [ ] Buttons remain clickable

### TEST 35: Loading States
1. [ ] Navigate to any page
2. [ ] Should show loading spinner
3. [ ] No blank white screen
4. [ ] No layout shift when data loads

### TEST 36: Error Handling
1. [ ] Turn off internet
2. [ ] Try to load data
3. [ ] Should show error message
4. [ ] Should not crash app
5. [ ] Turn internet back on
6. [ ] Should recover gracefully

---

## SECURITY TESTS

### TEST 37: RLS Policies
1. [ ] Open Supabase dashboard
2. [ ] Check RLS is enabled on:
   - ai_insights ✅
   - ai_actions ✅
   - products ✅
   - orders ✅
3. [ ] Verify policies exist

### TEST 38: Data Validation
1. [ ] Try to insert negative stock via SQL
2. [ ] Should fail with constraint error
3. [ ] Try to insert invalid enum value
4. [ ] Should fail with constraint error

---

## REGRESSION TESTS

### TEST 39: Old Features Still Work
1. [ ] Products page loads ✅
2. [ ] Stores page loads ✅
3. [ ] Inventory page loads ✅
4. [ ] Orders page loads ✅
5. [ ] Pricing page loads ✅

### TEST 40: No Breaking Changes
1. [ ] Store switching still works ✅
2. [ ] Product editing still works ✅
3. [ ] Inventory updates still work ✅
4. [ ] No console errors ✅

---

## FINAL CHECKLIST

### Deployment Readiness
- [ ] All tests above passed
- [ ] `npm run build` succeeds
- [ ] No TypeScript errors
- [ ] No ESLint errors (warnings OK)
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Supabase project configured
- [ ] RLS policies enabled
- [ ] Performance acceptable

### Documentation
- [ ] README.md up to date
- [ ] TESTING_CHECKLIST.md reviewed
- [ ] SYSTEM_TEST_RESULTS.md generated
- [ ] Code comments present

### User Acceptance
- [ ] Business stakeholders review dashboard
- [ ] AI insights make sense
- [ ] Suggested actions are valuable
- [ ] UI is intuitive
- [ ] No major usability issues

---

## SIGN-OFF

**Tested By:** ___________________
**Date:** ___________________
**Status:** [ ] APPROVED  [ ] NEEDS WORK
**Notes:**

---

## QUICK TEST COMMANDS

```bash
# Build project
npm run build

# Run dev server
npm run dev

# Check TypeScript
npx tsc --noEmit

# Lint code
npm run lint
```

## SQL Quick Tests

```sql
-- Check AI tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ai_insights', 'ai_actions');

-- Count insights by severity
SELECT severity, COUNT(*)
FROM ai_insights
WHERE is_dismissed = false
GROUP BY severity;

-- Count pending actions
SELECT COUNT(*) FROM ai_actions WHERE status = 'pending';

-- Check inventory health
SELECT
  COUNT(*) FILTER (WHERE stock_quantity - reserved_quantity = 0) as out_of_stock,
  COUNT(*) FILTER (WHERE stock_quantity - reserved_quantity <= low_stock_threshold AND stock_quantity - reserved_quantity > 0) as low_stock,
  COUNT(*) FILTER (WHERE stock_quantity - reserved_quantity > low_stock_threshold) as healthy
FROM central_inventory;
```

---

**End of Manual Test Checklist**
