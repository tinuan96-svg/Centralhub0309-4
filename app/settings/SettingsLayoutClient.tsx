'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { designTokens, PageHeader } from '@/lib/design-system';

export default function SettingsLayout({
  children,
  params: _params,
  searchParams: _searchParams,
}: {
  children: React.ReactNode;
  params: any;
  searchParams: any;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: '/settings/master-data/suppliers', label: 'Suppliers', icon: '🏭' },
    { href: '/settings/master-data/stores', label: 'Stores', icon: '🏪' },
    { href: '/settings/notifications', label: 'Notifications', icon: '🔔' },
    { href: '/settings/users', label: 'User Management', icon: '👥' },
    { href: '/inventory-management/reports/audit', label: 'Audit Logs', icon: '📜' },
  ];

  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="⚙️"
          title="Settings & Administration"
          subtitle="Suppliers, stores, notifications, users and system controls"
        />

        <div className="mt-8 flex flex-col gap-8 md:flex-row">
          <aside className="w-full shrink-0 md:w-64">
            <nav className="flex flex-col gap-1">
              {navItems.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                      isActive
                        ? 'border border-blue-500/20 bg-blue-500/10 font-medium text-blue-400'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
