import Link from 'next/link';
import PricingControlCentre from './PricingControlCentre';

export default function Page({ searchParams }: { searchParams: { tab?: string } }) {
  return (
    <>
      <div className="px-4 sm:px-6 pt-4 max-w-[1600px] mx-auto flex justify-end">
        <Link href="/pricing/approval" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-colors">
          Pricing Approval Centre →
        </Link>
      </div>
      <PricingControlCentre initialTab={searchParams?.tab || 'overview'} />
    </>
  );
}
