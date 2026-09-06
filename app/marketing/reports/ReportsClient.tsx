'use client';

import { PageHeader, Card, StatGrid, StatCard } from '@/lib/design-system';

export default function ReportsClient({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Marketing Reports & Exports"
        subtitle="Generate custom marketing reports and export data for deeper analysis."
      />

      <StatGrid columns={4}>
        <StatCard label="Generated Reports" value="0" icon="📄" />
        <StatCard label="Scheduled Tasks" value="0" icon="🕒" />
        <StatCard label="Data Volume" value="0 MB" icon="📊" />
        <StatCard label="Export Status" value="Idle" icon="✅" />
      </StatGrid>

      <Card className="p-20 bg-slate-900/50 border-slate-800 text-center flex flex-col items-center">
         <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-3xl mb-4">📥</div>
         <h3 className="text-xl font-bold text-white mb-2">Custom Reporting</h3>
         <p className="text-sm text-slate-500 mb-8 max-w-md">
            Build bespoke reports with your marketing data and schedule automatic exports to CSV, Google Sheets, or BigQuery.
         </p>
      </Card>
    </div>
  );
}
