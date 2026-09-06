# New Utilities & Tools Reference

**Quick import reference for all new performance and utility tools**

---

## 📦 Performance Hooks

### useDebounce & useThrottle
**File:** `lib/hooks/useDebounce.ts`

```typescript
import { useDebounce, useThrottle } from '@/lib/hooks/useDebounce';

// Debounce (delays until user stops typing)
const debouncedValue = useDebounce(value, 500);

// Throttle (limits frequency of updates)
const throttledValue = useThrottle(value, 500);
```

**Use Cases:**
- Search inputs (debounce)
- Form validation (debounce)
- Scroll handlers (throttle)
- Window resize (throttle)

---

### usePreventDoubleClick & useAsyncAction
**File:** `lib/hooks/usePreventDoubleClick.ts`

```typescript
import { usePreventDoubleClick, useAsyncAction } from '@/lib/hooks/usePreventDoubleClick';

// Prevent double-click (with delay)
const [execute, isExecuting] = usePreventDoubleClick(async () => {
  await saveData();
}, 1000);

// Async with loading & error states
const [execute, isLoading, error] = useAsyncAction(async () => {
  await submitForm();
});
```

**Use Cases:**
- Save buttons
- Submit forms
- Delete confirmations
- Any async user action

---

## 🛠️ Utility Functions

### Performance Monitor
**File:** `lib/utils/performanceMonitor.ts`

```typescript
import {
  performanceMonitor,
  measureAsync,
  measure
} from '@/lib/utils/performanceMonitor';

// Measure async operations
const data = await measureAsync('operation-name', async () => {
  return await fetchData();
});

// Measure sync operations
const result = measure('calculation', () => {
  return heavyCalculation();
});

// Manual tracking
performanceMonitor.start('custom-operation');
// ... do work
performanceMonitor.end('custom-operation');

// Analytics
const metrics = performanceMonitor.getMetrics();
const avgTime = performanceMonitor.getAverageTime('operation-name');
const slowest = performanceMonitor.getSlowestOperations(10);
performanceMonitor.clear();
```

**Features:**
- Automatic timing
- Warns if operation > 1000ms
- Stores metrics history
- Analytics functions

---

### API Cache
**File:** `lib/utils/apiCache.ts`

```typescript
import { apiCache, cachedFetch } from '@/lib/utils/apiCache';

// Automatic caching with fetch wrapper
const products = await cachedFetch('cache-key', async () => {
  return await ProductService.getAll();
}, 5 * 60 * 1000); // 5 minute TTL

// Manual cache control
apiCache.set('key', data, ttl);
const cached = apiCache.get('key');
const exists = apiCache.has('key');
apiCache.delete('key');
apiCache.clear();
apiCache.clearExpired();

// Cache stats
const size = apiCache.size();
```

**Features:**
- Automatic expiration
- Auto-cleanup every 60s
- TTL per entry
- Memory-based (fast)

**Default TTL:** 5 minutes

---

### Error Logger
**File:** `lib/utils/errorLogger.ts`

```typescript
import { logger } from '@/lib/utils/errorLogger';

// Log errors
logger.error('Operation failed', error);

// Log warnings
logger.warn('Slow operation detected', { duration: 2000 });

// Log info
logger.info('User action completed', { action: 'save' });

// Retrieve logs
const logs = logger.getLogs();
const errors = logs.filter(log => log.level === 'error');

// Clear logs
logger.clear();
```

**Features:**
- Structured logging
- Development: Console output
- Production: In-memory storage
- Max 100 logs (auto-rotation)
- Includes timestamps

---

## 🎨 Components

### ErrorBoundary
**File:** `components/ErrorBoundary.tsx`

```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Basic usage
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>

// Custom fallback
<ErrorBoundary fallback={<CustomErrorPage />}>
  <YourComponent />
</ErrorBoundary>
```

**Features:**
- Catches React errors
- Prevents white screen
- Shows user-friendly UI
- Provides reload button
- Displays error details (dev mode)

**Already implemented:** Root layout has system-wide error boundary

---

### RootErrorBoundary
**File:** `components/RootErrorBoundary.tsx`

```typescript
import RootErrorBoundary from '@/components/RootErrorBoundary';

// Client-side wrapper for error boundary
<RootErrorBoundary>
  {children}
</RootErrorBoundary>
```

**Purpose:** Client-side wrapper for using ErrorBoundary in app layout

---

## 🚀 Lazy Loading

### Lazy Components
**File:** `lib/utils/lazyComponents.ts`

```typescript
import {
  LazyProductsPage,
  LazyOrdersPage,
  LazyInventoryPage,
  LazyPricingPage,
  LazyStoresPage,
  LazyDashboardPage,
  LazySuppliersPage,
  LazyShippingPage,
  LazyPackingPage,
  LazyBankingPage,
  LazyPaymentsPage,
  LazyMarketingPage,
  LazyVATPage,
  LazyCommunicationPage,
  LazyProfitPage,
  LazyIntegrityPage
} from '@/lib/utils/lazyComponents';

// Usage with Suspense
import { Suspense } from 'react';

<Suspense fallback={<LoadingSpinner />}>
  <LazyProductsPage />
</Suspense>
```

**Features:**
- All major pages pre-configured
- Reduces initial bundle size
- On-demand loading
- Better caching

---

## 📊 Complete Import List

```typescript
// Hooks
import { useDebounce, useThrottle } from '@/lib/hooks/useDebounce';
import { usePreventDoubleClick, useAsyncAction } from '@/lib/hooks/usePreventDoubleClick';

// Utilities
import { performanceMonitor, measureAsync, measure } from '@/lib/utils/performanceMonitor';
import { apiCache, cachedFetch } from '@/lib/utils/apiCache';
import { logger } from '@/lib/utils/errorLogger';

// Components
import { ErrorBoundary } from '@/components/ErrorBoundary';
import RootErrorBoundary from '@/components/RootErrorBoundary';

// Lazy Components
import { LazyProductsPage, ... } from '@/lib/utils/lazyComponents';
```

---

## 🎯 Common Patterns

### Optimized Data Fetching
```typescript
import { cachedFetch } from '@/lib/utils/apiCache';
import { measureAsync } from '@/lib/utils/performanceMonitor';
import { logger } from '@/lib/utils/errorLogger';

const loadData = async () => {
  try {
    const data = await measureAsync('loadProducts', async () => {
      return await cachedFetch('products', async () => {
        return await ProductService.getAll();
      }, 5 * 60 * 1000);
    });

    return data;
  } catch (error) {
    logger.error('Failed to load products', error);
    throw error;
  }
};
```

### Optimized Search
```typescript
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useState, useEffect, useMemo } from 'react';

function SearchComponent({ data }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return data;
    return data.filter(item =>
      item.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [data, debouncedSearch]);

  return (
    <>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <List items={filtered} />
    </>
  );
}
```

### Optimized Form Submit
```typescript
import { useAsyncAction } from '@/lib/hooks/usePreventDoubleClick';
import { logger } from '@/lib/utils/errorLogger';

function FormComponent() {
  const [handleSubmit, isLoading, error] = useAsyncAction(async () => {
    await submitFormData();
    logger.info('Form submitted successfully');
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      {/* form fields */}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Submitting...' : 'Submit'}
      </button>
      {error && <div className="error">{error.message}</div>}
    </form>
  );
}
```

---

## 🔍 Debugging

### Check Performance
```typescript
import { performanceMonitor } from '@/lib/utils/performanceMonitor';

console.table(performanceMonitor.getSlowestOperations(10));
console.log('Average time:', performanceMonitor.getAverageTime('operation'));
```

### Check Cache
```typescript
import { apiCache } from '@/lib/utils/apiCache';

console.log('Cache entries:', apiCache.size());
console.log('Cached products:', apiCache.get('products'));
```

### Check Logs
```typescript
import { logger } from '@/lib/utils/errorLogger';

const logs = logger.getLogs();
const errors = logs.filter(l => l.level === 'error');
console.table(errors);
```

---

## 📋 Migration Guide

### Replace console.log
**Before:**
```typescript
console.log('User saved product');
console.error('Failed to save:', error);
```

**After:**
```typescript
import { logger } from '@/lib/utils/errorLogger';

logger.info('User saved product');
logger.error('Failed to save', error);
```

### Replace direct API calls
**Before:**
```typescript
const products = await ProductService.getAll();
```

**After:**
```typescript
import { cachedFetch } from '@/lib/utils/apiCache';

const products = await cachedFetch('products', async () => {
  return await ProductService.getAll();
}, 5 * 60 * 1000);
```

### Add performance tracking
**Before:**
```typescript
const data = await fetchData();
```

**After:**
```typescript
import { measureAsync } from '@/lib/utils/performanceMonitor';

const data = await measureAsync('fetchData', async () => {
  return await fetchData();
});
```

---

## ✅ Best Practices

1. **Always debounce** search and filter inputs
2. **Always prevent double-clicks** on async actions
3. **Cache frequently accessed** API data
4. **Monitor slow operations** in development
5. **Use error boundaries** for critical sections
6. **Log errors** with structured logger
7. **Measure performance** of heavy operations
8. **Use lazy loading** for route-based code splitting

---

## 📚 Full Documentation

See the following files for complete details:
- `DEEP_AUDIT_OPTIMIZATION_REPORT.md` - Complete technical guide
- `OPTIMIZATION_QUICK_REFERENCE.md` - Quick examples & patterns
- `AUDIT_SUMMARY.md` - Executive summary

---

**All utilities are production-ready and tested!** ✅
