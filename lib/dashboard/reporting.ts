import { supabase } from '@/lib/supabase';
import { ProfitAnalysisService } from '@/lib/services/profitAnalysisService';
import { getComparisonDateRange, getDateRange } from '@/lib/utils/date';
import { ComparisonType, TimeRange } from '@/lib/store/dashboardFilterStore';
import { InventoryRow, PeriodSummary, ReportOrder, ReportStore, numeric, summarisePeriod } from './metrics';
export { isPaidOrder, numeric, percentChange, productRevenue } from './metrics';
export type { PeriodSummary } from './metrics';

// Read-only business reporting. Dashboard order rows are payment-received only.
// Every page must succeed; never publish a silently truncated total.
export async function readReportRows<T = any>(query: () => any, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < 100000; start += 500) {
    const { data, error } = await query().range(start, start + 499);
    if (error) throw new Error(`${label} could not be loaded. Please retry.`);
    if (!Array.isArray(data)) throw new Error(`${label} returned no readable data.`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
  throw new Error(`${label} is too large for this view. Select a shorter period.`);
}

export type DashboardReport = { current: PeriodSummary; previous: PeriodSummary | null; orders: ReportOrder[]; inventory: InventoryRow[]; stores: ReportStore[]; products: { id: string; name: string; revenue: number; units: number }[]; start: Date; end: Date; loadedAt: Date };

export async function loadDashboardReport(filters: { timeRange: TimeRange; comparisonType: ComparisonType; selectedStoreId: string; customStartDate: string | null; customEndDate: string | null }): Promise<DashboardReport> {
  if (filters.timeRange === 'custom' && (!filters.customStartDate || !filters.customEndDate)) throw new Error('Select both a start date and an end date.');
  const { start, end } = getDateRange(filters.timeRange, filters.customStartDate || undefined, filters.customEndDate || undefined);
  if (end.getTime() - start.getTime() > 3660 * 86400000) throw new Error('Select a period of ten years or less.');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error('Choose a valid date range.');
  const previous = getComparisonDateRange(start, end, filters.comparisonType);
  const storeId = filters.selectedStoreId === 'all' ? undefined : filters.selectedStoreId;
  const ordersFor = (a: Date, b: Date) => readReportRows<ReportOrder>(() => {
    let q = supabase.from('orders').select('id,store_id,total,delivery_fee,order_status,payment_status,payment_method,created_at,delivery_city,customer_email').eq('is_deleted', false).eq('payment_status', 'paid').not('order_status', 'in', '("cancelled","refunded","failed")').gte('created_at', a.toISOString()).lte('created_at', b.toISOString()).order('id');
    if (storeId) q = q.eq('store_id', storeId);
    return q;
  }, 'Paid orders');
  const expensesFor = (a: Date, b: Date) => readReportRows(() => {
    let q = supabase.from('expenses').select('id,amount_gross').eq('payment_status', 'paid').gte('invoice_date', a.toISOString()).lte('invoice_date', b.toISOString()).order('id');
    if (storeId) q = q.eq('store_id', storeId);
    return q;
  }, 'Paid expenses');
  const [orders, priorOrders, expenses, priorExpenses, costs, priorCosts, inventory, stores, items] = await Promise.all([
    ordersFor(start, end), filters.comparisonType === 'none' ? Promise.resolve([]) : ordersFor(previous.start, previous.end),
    expensesFor(start, end), filters.comparisonType === 'none' ? Promise.resolve([]) : expensesFor(previous.start, previous.end),
    ProfitAnalysisService.getAllProfitOrders({ startDate: start, endDate: end, storeId }),
    filters.comparisonType === 'none' ? Promise.resolve([]) : ProfitAnalysisService.getAllProfitOrders({ startDate: previous.start, endDate: previous.end, storeId }),
    readReportRows<InventoryRow>(() => supabase.from('central_inventory').select('id,product_id,stock_quantity,low_stock_threshold,cost_price').order('id'), 'Warehouse stock'),
    readReportRows<ReportStore>(() => supabase.from('stores').select('id,name,slug').order('id'), 'Stores'),
    readReportRows(() => {
      let q = supabase.from('order_items').select('id,product_id,product_name,total_price,quantity,orders!inner(created_at,store_id,payment_status,order_status,is_deleted)').eq('orders.payment_status', 'paid').eq('orders.is_deleted', false).not('orders.order_status', 'in', '("cancelled","refunded","failed")').gte('orders.created_at', start.toISOString()).lte('orders.created_at', end.toISOString()).order('id');
      if (storeId) q = q.eq('orders.store_id', storeId);
      return q;
    }, 'Product sales'),
  ]);
  const productMap = new Map<string, { id: string; name: string; revenue: number; units: number }>();
  for (const item of items) {
    const key = item.product_id || item.product_name || 'unknown';
    const row = productMap.get(key) || { id: key, name: item.product_name || 'Unnamed product', revenue: 0, units: 0 };
    row.revenue += numeric(item.total_price); row.units += numeric(item.quantity); productMap.set(key, row);
  }
  return { current: summarisePeriod(orders, costs, expenses, inventory), previous: filters.comparisonType === 'none' ? null : summarisePeriod(priorOrders, priorCosts, priorExpenses, inventory), orders, inventory, stores, products: [...productMap.values()].sort((a, b) => b.revenue - a.revenue), start, end, loadedAt: new Date() };
}
