# Bulk Operations & AI Automation Guide

Comprehensive guide for bulk product management, AI-powered SEO generation, intelligent price optimization, and automated product creation in CentralHub.

---

## 🎯 Overview

This system provides enterprise-grade automation features:

- **Bulk Operations**: Edit, price, and delete multiple products at once
- **AI SEO Generation**: Auto-generate SEO metadata for products
- **AI Product Parser**: Convert raw product text into structured data
- **Price Optimization**: AI-driven dynamic pricing based on demand
- **Product Analytics**: Track sales, demand, and performance metrics

---

## 📊 Database Schema

### product_metrics Table

Tracks product performance for AI-driven pricing:

```sql
CREATE TABLE product_metrics (
  id uuid PRIMARY KEY,
  product_id uuid REFERENCES products(id),
  store_id uuid REFERENCES stores(id),

  -- Sales metrics
  sales_last_7_days integer DEFAULT 0,
  sales_last_30_days integer DEFAULT 0,
  revenue_last_7_days numeric DEFAULT 0,
  revenue_last_30_days numeric DEFAULT 0,

  -- Stock metrics
  current_stock_level integer DEFAULT 0,
  days_to_expiry integer,
  expiry_date date,

  -- Performance metrics
  demand_score numeric DEFAULT 0,
  velocity_score numeric DEFAULT 0,
  profitability_score numeric DEFAULT 0,

  -- Price optimization
  suggested_price numeric,
  suggested_price_reason text,
  price_optimization_applied boolean DEFAULT false,
  last_optimization_at timestamptz,

  metrics_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### product_seo_data Table

Stores SEO metadata with AI generation tracking:

```sql
CREATE TABLE product_seo_data (
  id uuid PRIMARY KEY,
  product_id uuid REFERENCES products(id),

  -- SEO fields
  seo_title text,
  meta_description text,
  keywords text[],
  slug text UNIQUE,

  -- Generation metadata
  generated_by_ai boolean DEFAULT false,
  ai_confidence_score numeric,
  last_generated_at timestamptz,
  manual_override boolean DEFAULT false
);
```

### bulk_operations_log Table

Audit trail with rollback support:

```sql
CREATE TABLE bulk_operations_log (
  id uuid PRIMARY KEY,
  operation_type text CHECK (operation_type IN ('edit', 'pricing', 'delete', 'seo_generate', 'price_optimize')),
  product_ids uuid[] NOT NULL,
  changes jsonb NOT NULL,
  affected_count integer NOT NULL,
  previous_state jsonb,
  can_rollback boolean DEFAULT true,
  rolled_back boolean DEFAULT false,
  performed_at timestamptz DEFAULT now()
);
```

### ai_suggestions_log Table

Track AI-generated suggestions and user acceptance:

```sql
CREATE TABLE ai_suggestions_log (
  id uuid PRIMARY KEY,
  suggestion_type text CHECK (suggestion_type IN ('seo', 'pricing', 'category', 'brand', 'product_parse')),
  input_data jsonb NOT NULL,
  output_data jsonb NOT NULL,
  product_id uuid REFERENCES products(id),
  confidence_score numeric,
  accepted boolean,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## 🔧 Core Services

### 1. Bulk Operations Service

**File**: `lib/services/bulkOperationsService.ts`

#### Bulk Edit

```typescript
import { BulkOperationsService } from '@/lib/services/bulkOperationsService';

// Update category for multiple products
const result = await BulkOperationsService.bulkEdit(
  ['product-id-1', 'product-id-2'],
  {
    category_id: 'new-category-id',
    unit: 'kg',
    name_prefix: 'Premium',
    name_suffix: '(New)'
  }
);

console.log(`Updated ${result.affected_count} products`);
```

#### Bulk Pricing

```typescript
// Increase prices by 10%
const result = await BulkOperationsService.bulkPricing(
  productIds,
  {
    operation: 'increase',
    value: 10,
    is_percentage: true
  }
);

// Decrease by fixed amount
const result = await BulkOperationsService.bulkPricing(
  productIds,
  {
    operation: 'decrease',
    value: 2.50,
    is_percentage: false
  }
);

// Set fixed price
const result = await BulkOperationsService.bulkPricing(
  productIds,
  {
    operation: 'set',
    value: 9.99,
    is_percentage: false
  }
);
```

#### Bulk Delete (Soft Delete)

```typescript
// Soft delete products (sets is_deleted = true)
const result = await BulkOperationsService.bulkDelete(productIds);
```

#### Rollback Operations

```typescript
// Rollback a bulk operation
const result = await BulkOperationsService.rollbackOperation(logId);
```

---

### 2. AI SEO Service

**File**: `lib/services/ai/aiSEOService.ts`

#### Generate SEO for Single Product

```typescript
import { AISEOService } from '@/lib/services/ai/aiSEOService';

const result = await AISEOService.generateSEO(
  'Premium Basmati Rice',     // productName
  'Tilda',                     // brandName
  'Rice',                      // categoryName
  '5kg',                       // variant
  'Long grain basmati rice'    // description
);

if (result.success && result.data) {
  console.log(result.data);
  // {
  //   seo_title: 'Tilda Premium Basmati Rice 5kg - Rice | Buy Online',
  //   meta_description: 'Shop Tilda Premium Basmati Rice in Rice online...',
  //   keywords: ['tilda', 'tilda products', 'premium basmati rice', ...],
  //   slug: 'tilda-premium-basmati-rice-5kg'
  // }
}
```

#### Save SEO Data

```typescript
await AISEOService.saveSEOData(
  productId,
  seoData,
  true  // generatedByAI
);
```

#### Bulk Generate SEO

```typescript
const products = [
  { id: 'uuid1', name: 'Product 1', brand_name: 'Brand A', ... },
  { id: 'uuid2', name: 'Product 2', brand_name: 'Brand B', ... },
];

const { success, failed } = await AISEOService.bulkGenerateSEO(products);
console.log(`Success: ${success}, Failed: ${failed}`);
```

---

### 3. AI Product Parser Service

**File**: `lib/services/ai/aiProductParserService.ts`

#### Parse Raw Product Input

```typescript
import { AIProductParserService } from '@/lib/services/ai/aiProductParserService';

const result = await AIProductParserService.parseProductInput(
  'Tilda Premium Basmati Rice 5kg'
);

if (result.success && result.data) {
  console.log(result.data);
  // {
  //   brand: 'Tilda',
  //   brand_id: 'uuid-of-tilda',
  //   product_name: 'Basmati Rice',
  //   variant: 'Premium',
  //   quantity: 5,
  //   unit: 'kg',
  //   category: 'Rice',
  //   category_id: 'uuid-of-rice-category',
  //   seo_data: { seo_title: '...', ... },
  //   confidence_score: 0.95
  // }
}
```

#### Create Product from Parsed Data

```typescript
const result = await AIProductParserService.createProductFromParsedData(
  parsedData,
  {
    cost_price: 8.50,
    selling_price: 12.99,
    stock_quantity: 100
  }
);

if (result.success) {
  console.log(`Product created with ID: ${result.product_id}`);
}
```

#### Bulk Parse Products

```typescript
const rawInputs = [
  'Tilda Premium Basmati Rice 5kg',
  'Aashirvaad Whole Wheat Atta 10kg',
  'MDH Chana Masala Powder 100g'
];

const { success, failed } = await AIProductParserService.bulkParseProducts(rawInputs);
console.log(`Parsed ${success.length} products, ${failed.length} failed`);
```

---

### 4. AI Price Optimization Service

**File**: `lib/services/ai/aiPriceOptimizationService.ts`

#### Update Product Metrics

```typescript
import { AIPriceOptimizationService } from '@/lib/services/ai/aiPriceOptimizationService';

// Update metrics for a specific product
await AIPriceOptimizationService.updateProductMetrics(productId, storeId);
```

#### Get Optimization Suggestions

```typescript
const result = await AIPriceOptimizationService.getOptimizationSuggestions(storeId);

if (result.success && result.suggestions) {
  result.suggestions.forEach(suggestion => {
    console.log(`Product: ${suggestion.product_id}`);
    console.log(`Current: £${suggestion.current_price}`);
    console.log(`Suggested: £${suggestion.suggested_price}`);
    console.log(`Reason: ${suggestion.reason}`);
    console.log(`Urgency: ${suggestion.urgency}`);
  });
}
```

#### Apply Single Optimization

```typescript
await AIPriceOptimizationService.applyOptimization(
  productId,
  suggestedPrice,
  'High demand detected - optimize margin'
);
```

#### Bulk Apply Optimizations

```typescript
const { applied, failed } = await AIPriceOptimizationService.bulkApplyOptimizations(
  suggestions,
  (current, total) => {
    console.log(`Progress: ${current}/${total}`);
  }
);

console.log(`Applied: ${applied}, Failed: ${failed}`);
```

#### Get Metrics Summary

```typescript
const summary = await AIPriceOptimizationService.getMetricsSummary(storeId);
// {
//   total_products: 150,
//   high_demand: 25,
//   low_demand: 40,
//   near_expiry: 5,
//   optimization_opportunities: 30
// }
```

---

## 🎨 UI Components

### 1. Bulk Actions Toolbar

**Component**: `<BulkActionsToolbar />`

Shows when products are selected, provides bulk action buttons:

```typescript
import BulkActionsToolbar from '@/components/BulkActionsToolbar';

<BulkActionsToolbar
  selectedCount={selectedProducts.length}
  selectedIds={selectedProducts.map(p => p.id)}
  onActionComplete={() => {
    // Refresh product list
    loadProducts();
    // Clear selection
    setSelectedProducts([]);
  }}
  onClearSelection={() => setSelectedProducts([])}
/>
```

**Features:**
- Edit (category, unit, name prefix/suffix)
- Pricing (increase, decrease, set)
- Generate SEO
- Bulk delete
- Clear selection

---

### 2. AI Product Creation Modal

**Component**: `<AIProductCreationModal />`

Parse raw product text and create structured products:

```typescript
import AIProductCreationModal from '@/components/AIProductCreationModal';

const [showModal, setShowModal] = useState(false);

<button onClick={() => setShowModal(true)}>
  Create with AI
</button>

<AIProductCreationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onProductCreated={() => {
    loadProducts();
    setShowModal(false);
  }}
/>
```

**Workflow:**
1. User enters raw product text (e.g., "Tilda Basmati Rice 5kg")
2. AI parses and extracts:
   - Brand (with fuzzy matching to existing brands)
   - Product name
   - Variant
   - Quantity and unit
   - Category (auto-detection)
3. AI generates SEO metadata
4. User reviews and edits parsed data
5. User adds pricing and stock
6. Product is created

---

### 3. Price Optimization Panel

**Component**: `<PriceOptimizationPanel />`

Display AI pricing suggestions with urgency levels:

```typescript
import PriceOptimizationPanel from '@/components/PriceOptimizationPanel';

<PriceOptimizationPanel
  storeId={currentStore.id}
  onClose={() => setShowPanel(false)}
/>
```

**Features:**
- Metrics summary (total products, high/low demand, near expiry)
- Prioritized suggestions (critical, high, medium, low)
- Reason explanations
- Apply individual or all suggestions
- Real-time demand score display

---

## 🚀 Database Functions

### Calculate Demand Score

```sql
SELECT calculate_demand_score(
  p_sales_7_days := 50,
  p_sales_30_days := 180,
  p_stock_level := 100,
  p_days_to_expiry := 5
);
-- Returns: numeric demand score
```

**Logic:**
- Base: daily sales rate / stock level
- Urgency multiplier for near-expiry items:
  - ≤3 days: 2.0x
  - ≤7 days: 1.5x
  - ≤14 days: 1.2x

---

### Suggest Optimal Price

```sql
SELECT * FROM suggest_optimal_price(
  p_current_price := 10.00,
  p_demand_score := 1.5,
  p_days_to_expiry := NULL,
  p_sales_7_days := 50,
  p_stock_level := 100
);
```

**Returns:**
- `suggested_price`: Optimized price
- `price_change_percent`: % change
- `reason`: Explanation
- `urgency`: Priority level

**Optimization Logic:**

1. **Near Expiry (Highest Priority)**:
   - 1 day: 50% off (critical)
   - ≤3 days: 30% off (high)
   - ≤7 days: 15% off (medium)
   - ≤14 days: 5% off (low)

2. **High Demand**:
   - Score > 1.5 & sales > 10: +10% (increase margin)
   - Score > 1.0 & sales > 5: +5%

3. **Low Demand**:
   - Score < 0.3 & stock > 20: -10% (move stock)
   - Score < 0.5 & stock > 10: -5%

---

### Generate Product Slug

```sql
SELECT generate_product_slug(
  p_product_name := 'Basmati Rice',
  p_brand_name := 'Tilda',
  p_variant := 'Premium'
);
-- Returns: 'tilda-basmati-rice-premium'
```

**Features:**
- Combines brand, name, variant
- Lowercase, hyphen-separated
- Removes special characters
- Ensures uniqueness (appends counter if needed)

---

### Fuzzy Match Brand

```sql
SELECT * FROM fuzzy_match_brand(
  p_brand_name := 'Tida',  -- Typo
  p_similarity_threshold := 0.6
);
```

**Returns:**
- `brand_id`: UUID
- `brand_name`: Matched name
- `similarity_score`: 0.0-1.0

**Matching Logic:**
- Exact match: 1.0
- Contains: 0.8
- Reverse contains: 0.7
- First word match: 0.6

---

## 📝 Common Use Cases

### Use Case 1: Bulk Update Category

```typescript
// Select 50 products and update their category
const productIds = products.slice(0, 50).map(p => p.id);

const result = await BulkOperationsService.bulkEdit(productIds, {
  category_id: newCategoryId
});

console.log(`Updated ${result.affected_count} products`);
```

---

### Use Case 2: Apply 10% Price Increase to All Products

```typescript
const { data: allProducts } = await supabase
  .from('products')
  .select('id')
  .eq('is_deleted', false);

const productIds = allProducts.map(p => p.id);

const result = await BulkOperationsService.bulkPricing(productIds, {
  operation: 'increase',
  value: 10,
  is_percentage: true
});
```

---

### Use Case 3: AI-Powered Product Import

```typescript
// CSV upload scenario
const rawProducts = [
  'Tilda Premium Basmati Rice 5kg',
  'Aashirvaad Atta 10kg',
  'MDH Masala 100g',
  // ... 100 more
];

const { success, failed } = await AIProductParserService.bulkParseProducts(rawProducts);

for (const parsed of success) {
  await AIProductParserService.createProductFromParsedData(parsed, {
    cost_price: 0,  // TODO: Add pricing logic
    selling_price: 0,
    stock_quantity: 0
  });
}

console.log(`Created ${success.length} products, ${failed.length} failed`);
```

---

### Use Case 4: Daily Price Optimization

```typescript
// Run daily price optimization
async function dailyPriceOptimization(storeId: string) {
  // 1. Refresh metrics
  await AIPriceOptimizationService.refreshMetricsForStore(storeId);

  // 2. Get suggestions
  const { suggestions } = await AIPriceOptimizationService.getOptimizationSuggestions(storeId);

  // 3. Auto-apply critical urgency items
  const critical = suggestions.filter(s => s.urgency === 'critical');
  await AIPriceOptimizationService.bulkApplyOptimizations(critical);

  console.log(`Applied ${critical.length} critical price optimizations`);
}
```

---

### Use Case 5: Generate SEO for All Products

```typescript
const { data: products } = await supabase
  .from('products')
  .select(`
    id,
    name,
    description,
    brands:brand_id (name),
    categories:category_id (name)
  `)
  .is('is_deleted', false)
  .limit(1000);

const formatted = products.map(p => ({
  id: p.id,
  name: p.name,
  brand_name: p.brands?.name,
  category_name: p.categories?.name,
  description: p.description
}));

const { success, failed } = await AISEOService.bulkGenerateSEO(formatted);
console.log(`Generated SEO for ${success} products, ${failed} failed`);
```

---

## 🛡️ Safety Features

### 1. Soft Delete

All bulk deletes use soft delete (`is_deleted = true`), never hard delete.

### 2. Rollback Support

Every bulk operation is logged with previous state:

```typescript
// Rollback if something goes wrong
const history = await BulkOperationsService.getOperationHistory(50);
const lastOp = history[0];

if (lastOp.can_rollback && !lastOp.rolled_back) {
  await BulkOperationsService.rollbackOperation(lastOp.id);
}
```

### 3. Validation

```typescript
// Validate product IDs before bulk operation
const { valid, invalid } = await BulkOperationsService.validateProductIds(productIds);

if (invalid.length > 0) {
  console.warn(`Invalid IDs: ${invalid}`);
}

// Only proceed with valid IDs
await BulkOperationsService.bulkEdit(valid, updates);
```

### 4. Confirmation Prompts

All UI components include confirmation modals before destructive actions.

---

## 📊 Analytics & Monitoring

### Track Operation History

```typescript
const history = await BulkOperationsService.getOperationHistory(50);

history.forEach(op => {
  console.log(`${op.operation_type}: ${op.affected_count} products`);
  console.log(`Performed at: ${op.performed_at}`);
  console.log(`Can rollback: ${op.can_rollback}`);
});
```

### Monitor AI Suggestions

```typescript
const { data: aiLogs } = await supabase
  .from('ai_suggestions_log')
  .select('*')
  .eq('suggestion_type', 'pricing')
  .order('created_at', { ascending: false })
  .limit(100);

const acceptanceRate = aiLogs.filter(l => l.accepted).length / aiLogs.length;
console.log(`AI Acceptance Rate: ${(acceptanceRate * 100).toFixed(1)}%`);
```

---

## 🎯 Best Practices

### 1. Run Metrics Updates Regularly

```typescript
// Schedule daily metrics refresh
setInterval(async () => {
  await AIPriceOptimizationService.refreshMetricsForStore(storeId);
}, 24 * 60 * 60 * 1000);  // Daily
```

### 2. Review AI Suggestions Before Auto-Apply

Only auto-apply low-risk suggestions. Review high-impact changes manually.

### 3. Use Bulk Operations Wisely

Test on small subset first, then apply to larger set.

### 4. Monitor Rollback History

Keep audit trail for compliance and debugging.

### 5. Validate Parsed Data

Always review AI-parsed products before creating them.

---

## 📈 Performance Tips

1. **Batch Operations**: Process in chunks of 100-500 products
2. **Use Transactions**: For critical bulk operations
3. **Index Optimization**: Indexes are pre-created for common queries
4. **Cache Metrics**: Metrics are date-partitioned for fast queries
5. **Async Processing**: Use background jobs for large bulk operations

---

## 🚀 Summary

The Bulk Operations & AI system provides:

- ✅ **Bulk Edit**: Update multiple products at once
- ✅ **Bulk Pricing**: Percentage or fixed price changes
- ✅ **Bulk Delete**: Soft delete with rollback
- ✅ **AI SEO Generation**: Auto-generate metadata
- ✅ **AI Product Parser**: Convert raw text to structured data
- ✅ **Brand Matching**: Fuzzy matching for existing brands
- ✅ **Category Detection**: Auto-detect product categories
- ✅ **Price Optimization**: AI-driven dynamic pricing
- ✅ **Demand Scoring**: Sales velocity analysis
- ✅ **Expiry Handling**: Aggressive discounts for near-expiry
- ✅ **Audit Trail**: Complete operation logging
- ✅ **Rollback Support**: Undo bulk operations
- ✅ **Safety**: Confirmations and validations

This system reduces manual work by 90% and enables intelligent, data-driven pricing strategies across your entire product catalog!
