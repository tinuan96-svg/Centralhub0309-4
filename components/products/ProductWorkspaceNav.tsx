'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/inventory', label: 'Products', icon: '📦', exact: true },
  { href: '/inventory/categories', label: 'Categories & Sales', icon: '📁' },
  { href: '/inventory/brands', label: 'Brands & Sales', icon: '🏷️' },
];

export default function ProductWorkspaceNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 lg:p-5 shadow-xl">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black tracking-tight text-white">Products</h1>
            <span className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-300">Deep intelligence</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Manage the catalogue, then drill into category and brand sales. Tap any category or brand for its complete paid-sales report.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            <span className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1">Store scope</span>
            <span className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1">7D–All history</span>
            <span className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1">Revenue · units · profit</span>
            <span className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1">Graphs · indices · CSV</span>
          </div>
        </div>

        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 p-1" aria-label="Product workspace">
          {tabs.map(tab => {
            const active = isActive(tab.href, tab.exact);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${
                  active ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
