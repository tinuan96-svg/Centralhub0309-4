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
import { AuditReportService, AuditSummary, AuditLogEntry } from '@/lib/services/inventory/auditReportService';
import Link from 'next/link';

export default function AuditReportClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [trail, setTrail] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [summaryData, trailData] = await Promise.all([
        AuditReportService.getAuditSummary(timeRange),
        AuditReportService.getAuditTrail(100)
      ]);
      setSummary(summaryData);
      setTrail(trailData);
      setLoading(false);
    };

    loadData();
  }, [timeRange]);

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
