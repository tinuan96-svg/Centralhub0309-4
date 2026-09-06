import SkeletonLoader from '@/components/SkeletonLoader';

export default function Loading() {
  return (
    <div className="p-8 space-y-8 bg-slate-950 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-3">
          <div className="h-10 w-64 bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-4 w-96 bg-slate-800/50 rounded-lg animate-pulse" />
        </div>
        <div className="h-12 w-40 bg-blue-600/20 rounded-2xl border border-blue-500/20 animate-pulse" />
      </div>

      <div className="space-y-10">
        <section>
          <div className="h-6 w-32 bg-slate-800 rounded mb-4" />
          <SkeletonLoader variant="metric" count={4} />
        </section>

        <section>
          <div className="h-6 w-32 bg-slate-800 rounded mb-4" />
          <SkeletonLoader variant="chart" />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="h-6 w-32 bg-slate-800 rounded mb-4" />
            <SkeletonLoader variant="list" count={5} />
          </div>
          <div>
            <div className="h-6 w-32 bg-slate-800 rounded mb-4" />
            <SkeletonLoader variant="card" count={2} />
          </div>
        </section>
      </div>
    </div>
  );
}
