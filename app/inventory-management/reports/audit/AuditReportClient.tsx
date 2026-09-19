'use client';

import { useState, useEffect } from 'react';
import {
  PageHeader,
  Card,
  CardContent,
  StatGrid,
  StatCard,
  Badge,
  designTokens,
  SectionHeader
} from '@/lib/design-system';
import { AuditReportService, AuditSummary, AuditLogEntry, AuditException, AuditSessionSummary } from '@/lib/services/inventory/auditReportService';
import Link from 'next/link';

export default function AuditReportClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [trail, setTrail] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);
  const [exceptions, setExceptions] = useState<AuditException[]>([]);
  const [latestSession, setLatestSession] = useState<AuditSessionSummary | null>(null);
  const [confirmedStocks, setConfirmedStocks] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [summaryData, trailData, exceptionData, sessionData] = await Promise.all([
      AuditReportService.getAuditSummary(timeRange),
      AuditReportService.getAuditTrail(100),
      AuditReportService.getAuditExceptions(250),
      AuditReportService.getLatestFullAuditSession(),
    ]);
    setSummary(summaryData);
    setTrail(trailData);
    setExceptions(exceptionData);
    setLatestSession(sessionData);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [timeRange]);

  const resolveException = async (
    item: AuditException,
    resolution: 'found' | 'not_found' | 'damaged' | 'expired',
  ) => {
    let confirmedStock: number | undefined;
    if (resolution === 'found') {
      const raw = confirmedStocks[item.id] ?? '';
      confirmedStock = Number(raw);
      if (!Number.isFinite(confirmedStock) || confirmedStock < 0 || raw.trim() === '') {
        window.alert('Enter the physical stock you found before confirming this product.');
        return;
      }
    }

    const label = resolution === 'found'
      ? `restore this product with stock ${confirmedStock}`
      : resolution === 'not_found'
        ? 'keep this product at zero and mark it not found'
        : resolution === 'damaged'
          ? 'keep this product at zero and classify it as damaged'
          : 'keep this product at zero and classify it as expired';

    if (!window.confirm(`Confirm: ${label}?`)) return;

    setResolvingId(item.id);
    const ok = await AuditReportService.resolveAuditException(item.id, resolution, confirmedStock);
    setResolvingId(null);
    if (!ok) {
      window.alert('Could not update this audit exception.');
      return;
    }
    await loadData();
  };

  if (loading) return <div className="p-12 text-center text-slate-400">Loading Audit Analytics...</div>;

  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="📊"
          title="Audit Trail Report"
          subtitle="Stock discrepancies, losses, and gains from physical audits"
          action={
            <div className="flex gap-2">
               <select
                value={timeRange}
                onChange={(e) => setTimeRange(parseInt(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white"
               >
                 <option value={7}>Last 7 Days</option>
                 <option value={30}>Last 30 Days</option>
                 <option value={90}>Last 90 Days</option>
               </select>
               <Link href="/inventory-management/reports" className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded-lg border border-slate-700 hover:bg-slate-700">Back</Link>
            </div>
          }
        />

        <div className={designTokens.spacing.section}>
          {summary && (
            <StatGrid columns={4}>
              <StatCard
                label="Total Audits"
                value={summary.totalAudits.toString()}
                icon="📋"
                description={`Across ${summary.affectedProductsCount} products`}
              />
              <StatCard
                label="Stock Gained"
                value={summary.totalGained.toString()}
                icon="📈"
                description="Units found above system count"
              />
              <StatCard
                label="Stock Lost"
                value={summary.totalLost.toString()}
                icon="📉"
                description="Units missing from shelf"
              />
              <StatCard
                label="Net Change"
                value={summary.netChange > 0 ? `+${summary.netChange}` : summary.netChange.toString()}
                icon="🔄"
                description="Overall stock adjustment impact"
              />
            </StatGrid>
          )}

          <Card>
            <CardContent>
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div>
                  <SectionHeader
                    title="Not Counted / Audit Holds"
                    subtitle="Positive system stock not physically counted is forced to zero and unpublished until you confirm what happened."
                  />
                  {latestSession && (
                    <p className="text-xs text-slate-500 mt-2">
                      Latest full audit: {latestSession.status} · Snapshot {latestSession.snapshot_product_count} · Counted {latestSession.counted_product_count} · Missing {latestSession.missing_product_count}
                    </p>
                  )}
                </div>
                <Link
                  href="/inventory-audit"
                  className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black uppercase text-slate-200 whitespace-nowrap"
                >
                  Open Stock Audit
                </Link>
              </div>

              <div className="mt-6 space-y-3">
                {exceptions.filter(item => item.status === 'missing_pending').map(item => (
                  <div key={item.id} className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                    <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-slate-100">{item.product_name}</p>
                          <Badge variant="danger">Not counted</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          SKU {item.sku || '—'} · System had {item.quarantined_stock ?? item.system_stock_at_finalize ?? item.system_stock_before} ·
                          Location {item.warehouse_location || 'Unassigned'}
                        </p>
                        <p className="text-[11px] text-rose-300 mt-2">
                          Storefront state: stock 0, inactive, unpublished until resolved.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">Found qty</label>
                          <input
                            type="number"
                            min={0}
                            value={confirmedStocks[item.id] ?? ''}
                            onChange={(e) => setConfirmedStocks(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-24 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm font-bold text-white"
                            placeholder="0"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={resolvingId === item.id}
                          onClick={() => resolveException(item, 'found')}
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black disabled:opacity-50"
                        >
                          Found
                        </button>
                        <button
                          type="button"
                          disabled={resolvingId === item.id}
                          onClick={() => resolveException(item, 'not_found')}
                          className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-black disabled:opacity-50"
                        >
                          Not Found
                        </button>
                        <button
                          type="button"
                          disabled={resolvingId === item.id}
                          onClick={() => resolveException(item, 'damaged')}
                          className="px-3 py-2 rounded-lg bg-orange-600 text-white text-xs font-black disabled:opacity-50"
                        >
                          Damaged
                        </button>
                        <button
                          type="button"
                          disabled={resolvingId === item.id}
                          onClick={() => resolveException(item, 'expired')}
                          className="px-3 py-2 rounded-lg bg-rose-700 text-white text-xs font-black disabled:opacity-50"
                        >
                          Expired
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {exceptions.filter(item => item.status === 'missing_pending').length === 0 && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-300">
                    No unresolved “not counted” products are waiting for confirmation.
                  </div>
                )}
              </div>

              {exceptions.some(item => item.status !== 'missing_pending') && (
                <div className="mt-6 border-t border-slate-800 pt-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-black text-slate-500 mb-3">Recently resolved</p>
                  <div className="flex flex-wrap gap-2">
                    {exceptions.filter(item => item.status !== 'missing_pending').slice(0, 20).map(item => (
                      <span key={item.id} className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                        {item.product_name} · {item.status.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <SectionHeader title="Recent Audit Logs" subtitle="Detailed breakdown of individual stock checks" />

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Prev. System</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Physical Count</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Difference</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Notes</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trail.map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-200">{entry.product_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{entry.sku || 'No SKU'}</p>
                        </td>
                        <td className="px-4 py-4 text-center text-slate-400 font-mono">{entry.old_quantity}</td>
                        <td className="px-4 py-4 text-center text-slate-100 font-bold font-mono">{entry.new_quantity}</td>
                        <td className="px-4 py-4 text-center">
                          <Badge variant={entry.change > 0 ? 'success' : entry.change < 0 ? 'danger' : 'info'}>
                            {entry.change > 0 ? `+${entry.change}` : entry.change}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-400 italic max-w-xs truncate">{entry.notes || '—'}</td>
                        <td className="px-4 py-4 text-right">
                          <p className="text-slate-300 font-medium">
                            {new Date(entry.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </p>
                          <p className="text-[10px] text-slate-500 uppercase">
                            {new Date(entry.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </td>
                      </tr>
                    ))}
                    {trail.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500 italic">No audit records found for this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
