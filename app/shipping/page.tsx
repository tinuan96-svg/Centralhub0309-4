import Link from 'next/link';
import ShippingClient from './ShippingClient';
import DeliveredShipmentsClient from './DeliveredShipmentsClient';

export default async function Page({ params, searchParams }: { params: any; searchParams: any }) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const delivered = String(resolvedSearchParams?.filter || '').toLowerCase() === 'delivered';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Link
          href="/shipping"
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${!delivered ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
        >
          Active / All
        </Link>
        <Link
          href="/shipping?filter=delivered"
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${delivered ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
        >
          Delivered
        </Link>
      </div>

      {delivered
        ? <DeliveredShipmentsClient />
        : <ShippingClient params={resolvedParams} searchParams={resolvedSearchParams} />}
    </div>
  );
}
