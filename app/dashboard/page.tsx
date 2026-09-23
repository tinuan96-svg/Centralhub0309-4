import Link from 'next/link';
import DashboardClientWrapper from './DashboardClientWrapper';

export default function DashboardPage() {
  return <><div className="flex justify-end px-4 pt-3"><Link href="/shop-applications" className="rounded-lg border border-teal-700 bg-slate-900 px-4 py-2 text-xs font-bold text-teal-300 hover:bg-slate-800">CentralHub Shop applications →</Link></div><DashboardClientWrapper /></>;
}
