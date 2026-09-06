'use client';

import { PageHeader, Card, StatGrid, StatCard, Button } from '@/lib/design-system';

export default function EmailMarketing({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Email Marketing"
        subtitle="Design and send email campaigns to your customer base."
      />

      <StatGrid columns={4}>
        <StatCard label="Campaigns Sent" value="0" icon="📧" />
        <StatCard label="Avg. Open Rate" value="0%" icon="📂" />
        <StatCard label="Avg. Click Rate" value="0%" icon="🖱️" />
        <StatCard label="Revenue Attributed" value="£0.00" icon="💰" />
      </StatGrid>

      <Card className="p-20 bg-slate-900/50 border-slate-800 text-center flex flex-col items-center">
         <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-3xl mb-4">🔌</div>
         <h3 className="text-xl font-bold text-white mb-2">Connect Email Provider</h3>
         <p className="text-sm text-slate-500 mb-8 max-w-md">
            Integrate with Klaviyo or Mailchimp to start sending targeted email campaigns directly from CentralHub.
         </p>
         <Button onClick={() => window.location.href='/marketing/integrations'}>
            Go to Integrations
         </Button>
      </Card>
    </div>
  );
}
