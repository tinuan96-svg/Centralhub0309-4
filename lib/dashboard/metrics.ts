import type { ProfitOrderRow } from '@/lib/services/profitAnalysisService';

export type ReportOrder = { id: string; store_id: string | null; total: number; delivery_fee: number; order_status: string; payment_status: string; payment_method: string | null; created_at: string; delivery_city: string | null; customer_email: string | null };
export type InventoryRow = { id: string; product_id: string; stock_quantity: number; low_stock_threshold: number | null; cost_price: number | null };
export type ReportStore = { id: string; name: string; slug: string | null };
export type PeriodSummary = { totalRevenue: number; productSubtotal: number; deliveryRevenue: number; actualGrossProfit: number | null; totalOverhead: number; netProfit: number | null; totalInventoryValue: number | null; totalOrders: number; pendingOrders: number; estimatedCosts: number; missingCosts: number; costRows: ProfitOrderRow[] };

export const isPaidOrder = (o: ReportOrder) => String(o.payment_status || '').toLowerCase() === 'paid' && !['cancelled', 'refunded', 'failed'].includes(String(o.order_status || '').toLowerCase());
export const numeric = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
export const paidOrderRevenue = (o: ReportOrder) => numeric(o.total);
export const productSubtotal = (o: ReportOrder) => Math.max(0, numeric(o.total) - numeric(o.delivery_fee));
export const productRevenue = paidOrderRevenue;
export const percentChange = (current: number, previous: number | null | undefined): number | null => previous == null || previous === 0 || !Number.isFinite(current) || !Number.isFinite(previous) ? null : (current - previous) / Math.abs(previous) * 100;

export function summarisePeriod(orders: ReportOrder[], costs: ProfitOrderRow[], expenses: any[], inventory: InventoryRow[]): PeriodSummary {
  const paid = orders.filter(isPaidOrder);
  const paidIds = new Set(paid.map(o => o.id));
  const matchedCosts = costs.filter(o => paidIds.has(o.id));
  const costIds = new Set(matchedCosts.map(o => o.id));
  const completeCosts = costIds.size === paid.length && matchedCosts.length === paid.length;
  const missingCosts = completeCosts ? matchedCosts.filter(o => o.cost_quality === 'missing' || !Number.isFinite(o.gross_profit)).length : paid.length;
  const estimatedCosts = matchedCosts.filter(o => o.cost_quality === 'estimated_current').length;
  const actualGrossProfit = missingCosts > 0 ? null : matchedCosts.reduce((sum, o) => sum + o.gross_profit, 0);
  const totalOverhead = expenses.reduce((sum, e) => sum + numeric(e.amount_gross), 0);
  const unvaluedInventory = inventory.some(i => numeric(i.stock_quantity) !== 0 && (i.cost_price == null || !Number.isFinite(Number(i.cost_price))));
  const productSubtotalValue = paid.reduce((sum, o) => sum + productSubtotal(o), 0);
  const deliveryRevenueValue = paid.reduce((sum, o) => sum + numeric(o.delivery_fee), 0);
  return {
    totalRevenue: paid.reduce((sum, o) => sum + paidOrderRevenue(o), 0),
    productSubtotal: productSubtotalValue,
    deliveryRevenue: deliveryRevenueValue,
    actualGrossProfit, totalOverhead,
    netProfit: actualGrossProfit === null ? null : actualGrossProfit - totalOverhead,
    totalInventoryValue: unvaluedInventory ? null : inventory.reduce((sum, i) => sum + numeric(i.stock_quantity) * numeric(i.cost_price), 0),
    totalOrders: paid.length,
    pendingOrders: 0,
    estimatedCosts, missingCosts, costRows: matchedCosts,
  };
}
