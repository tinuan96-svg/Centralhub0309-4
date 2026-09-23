import type { Metadata } from 'next';
import DemoDashboardClient from '@/components/demo/DemoDashboardClient';

export const metadata: Metadata = {
  title: 'CentralHub | Demo Dashboard',
  description: 'Explore the CentralHub workspace with fictional example data. No account or live business access required.',
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoDashboardClient />;
}
