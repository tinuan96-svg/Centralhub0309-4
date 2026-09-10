'use client';

import { useEffect, useState } from 'react';
import { Banknote, CircleAlert, Landmark, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';
import { MetricBars, Panel } from '@/components/dashboard/Charts';
import { GradientRing } from '@/components/dashboard/ReferenceCharts';
import { MetricState, VisualMetric } from '@/components/dashboard/VisualMetric';

type Metric = { revenue: number; cogs: number; variable_costs: number; operating_expenses: number; net_profit: number; orders: number; average_profit_per_order: number; cash_in: number; cash_out: number; closing_cash: number };
type Recon = { total_transactions: number; unreconciled_transactions: number; reconciled_transactions: number; overdue_reconciliation_transactions: number; unreconciled_value: number };
type FinancialCard = 'all' | 'finance' | 'bank';
const amount = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? '—' : formatCurrency(Number(value));

export default function FinancialCommandSummary({ refreshKey = 0, card = 'all' }: { refreshKey?: number; card?: FinancialCard }) {
  const [metrics, setMetrics] = useState<Metric | null>(null);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState({ finance: false, bank: false });

  useEffect(() => {
    let cancelled = false;
    const needsFinance = card !== 'bank';
    const needsBank = card !== 'finance';
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    setLoading(true);
    setFailed({ finance: false, bank: false });

    const financeRequest = needsFinance
      ? supabase.rpc('get_financial_performance', { p_start_date: start.toISOString().slice(0, 10), p_end_date: end.toISOString().slice(0, 10) })
      : Promise.resolve(null);
    const bankRequest = needsBank
      ? supabase.from('v_bank_reconciliation_summary').select('*').single()
      : Promise.resolve(null);

    Promise.allSettled([financeRequest, bankRequest]).then(([financial, bank]) => {
      if (cancelled) return;
      const financeOk = !needsFinance || (financial.status === 'fulfilled' && financial.value !== null && !financial.value.error);
      const bankOk = !needsBank || (bank.status === 'fulfilled' && bank.value !== null && !bank.value.error);

      if (needsFinance) setMetrics(financeOk && financial.status === 'fulfilled' && financial.value ? financial.value.data?.[0] || null : null);
      if (needsBank) setRecon(bankOk && bank.status === 'fulfilled' && bank.value ? bank.value.data || null : null);
      setFailed({ finance: needsFinance && !financeOk, bank: needsBank && !bankOk });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey, card]);

  const bankTotal = recon?.total_transactions == null ? null : Number(recon.total_transactions);
  const reconciled = recon?.reconciled_transactions == null ? null : Number(recon.reconciled_transactions);
  const reconciliationRate = bankTotal !== null && bankTotal > 0 && reconciled !== null && Number.isFinite(reconciled) ? reconciled / bankTotal * 100 : null;

  return <>
    {card !== 'bank' && <Panel title="Finance" subtitle="Last 7 days · all stores · accounting">
      {!metrics ? <MetricState loading={loading} error={failed.finance} label="No financial data" /> : <>
        <div className="ch-visual-metrics"><VisualMetric label="7D Revenue" value={amount(metrics.revenue)} icon={<Banknote size={14} />} /><VisualMetric label="7D Net profit" value={amount(metrics.net_profit)} icon={<TrendingUp size={14} />} /><VisualMetric label="Profit / order" value={amount(metrics.average_profit_per_order)} /><VisualMetric label="Bank Closing" value={amount(metrics.closing_cash)} icon={<Landmark size={14} />} /></div>
        <MetricBars data={[{ label: 'Revenue', value: metrics.revenue == null ? NaN : Number(metrics.revenue), color: '#50e4eb' }, { label: 'Net profit', value: metrics.net_profit == null ? NaN : Number(metrics.net_profit), color: '#f04fed' }]} format={formatCurrency} />
      </>}
    </Panel>}
    {card !== 'finance' && <Panel title="Bank reconciliation" subtitle="Current bank records · all stores">
      {!recon ? <MetricState loading={loading} error={failed.bank} label="No bank data" /> : <>
        <div className="ch-visual-ring-pair"><GradientRing label="Reconciled" value={reconciliationRate} detail={`${reconciled ?? '—'} / ${bankTotal ?? '—'} transactions`} /><div className="ch-visual-metrics ch-visual-metrics-column"><VisualMetric label="Unreconciled" value={recon.unreconciled_transactions ?? '—'} icon={<CircleAlert size={14} />} /><VisualMetric label="Outstanding" value={amount(recon.unreconciled_value)} /><VisualMetric label="Older than today" value={recon.overdue_reconciliation_transactions ?? '—'} /></div></div>
      </>}
    </Panel>}
  </>;
}
