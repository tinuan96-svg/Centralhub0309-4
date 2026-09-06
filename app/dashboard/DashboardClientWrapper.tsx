'use client';

import dynamic from 'next/dynamic';

const FinancialCommandSummary = dynamic(
  () => import('@/app/finance/FinancialCommandSummary'),
  {
    ssr: false,
    loading: () => <div className="h-36 bg-slate-950" />,
  },
);

const DashboardClient = dynamic(() => import('./DashboardClient'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-slate-950" />,
});

export default function DashboardClientWrapper() {
  return (
    <>
      <FinancialCommandSummary />
      <DashboardClient params={{}} searchParams={{}} />
    </>
  );
}
