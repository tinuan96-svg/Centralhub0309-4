import Link from 'next/link';
import PricingControlCentre from './PricingControlCentre';
import PricingGuardrailStatus from './PricingGuardrailStatus';

export default function Page({ searchParams }: { searchParams: { tab?: string } }) {
  return (
    <>
      <PricingGuardrailStatus />
      <div className="px-4 sm:px-6 pt-4 max-w-[1600px] mx-auto flex flex-wrap justify-end gap-2">
        <Link href="/pricing/decision-table" className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase tracking-widest hover:bg-cyan-500 transition-colors">
          Pricing Decision Table →
        </Link>
        <Link href="/pricing/approval" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-colors">
          Pricing Approval Centre →
        </Link>
      </div>
      <PricingControlCentre initialTab={searchParams?.tab || 'overview'} />
    </>
  );
}
