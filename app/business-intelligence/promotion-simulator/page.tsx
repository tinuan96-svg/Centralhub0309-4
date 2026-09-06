import PromotionSimulator from '@/app/marketing/intelligence/PromotionSimulator';

export default function PromotionSimulatorPage({ params, searchParams }: { params: any; searchParams: any }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tight">Promotion Simulator</h1>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Safe-to-Promote Intelligence & Break-even Analysis</p>
      </div>
      <PromotionSimulator />
    </div>
  );
}
