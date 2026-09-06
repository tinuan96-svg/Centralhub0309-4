import PayableAlertsClient from '../PayableAlertsClient';

export default function FinancialAlertsPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-[1700px] mx-auto">
        <div className="mb-6">
          <a href="/finance" className="text-xs text-cyan-400">← Finance</a>
          <h1 className="text-3xl font-black text-white mt-2">Financial Alerts</h1>
          <p className="text-sm text-slate-500 mt-1">Supplier due dates, overdue liabilities and financial actions requiring attention.</p>
        </div>
        <PayableAlertsClient />
      </div>
    </main>
  );
}
