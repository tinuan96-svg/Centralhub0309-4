'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { designTokens, PageHeader } from '@/lib/design-system';

export default function SettingsLayout({
  children,
  params,
  searchParams,
}: {
  children: React.ReactNode;
  params: any;
  searchParams: any;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: '/settings/master-data/categories', label: 'Categories', icon: '📁' },
    { href: '/settings/master-data/brands', label: 'Brands', icon: '🏷️' },
    { href: '/settings/master-data/suppliers', label: 'Suppliers', icon: '🏭' },
    { href: '/settings/master-data/stores', label: 'Stores', icon: '🏪' },
    { href: '/settings/users', label: 'User Management', icon: '👥' },
  ];

  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="⚙️"
          title="Settings & Master Data"
          subtitle="Manage core system configurations and master records"
        />

        <div className="flex flex-col md:flex-row gap-8 mt-8">
          <aside className="w-full md:w-64 shrink-0">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
