'use client';

import dynamic from 'next/dynamic';

const DashboardStoreChat = dynamic(() => import('./components/DashboardStoreChat'), { ssr: false });

const DashboardClient = dynamic(() => import('./DashboardClient'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-slate-950" />,
});

export default function DashboardClientWrapper() {
  return (
    <>
      <DashboardClient params={{}} searchParams={{}} />
      <DashboardStoreChat />
    </>
  );
}
