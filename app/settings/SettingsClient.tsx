'use client';

import Link from 'next/link';
import QuickShortcutsSettings from './QuickShortcutsSettings';

export default function SettingsOverviewPage({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const sections = [
    {
      title: 'Business Partners',
      description: 'Supplier and procurement master records stay here in system settings.',
      items: [
        { name: 'Suppliers', href: '/settings/master-data/suppliers', icon: '🏭', detail: 'Suppliers, purchasing relationships and source records' },
      ],
    },
    {
      title: 'Store Management',
      description: 'Manage the connected stores and their system configuration.',
      items: [
        { name: 'Stores', href: '/settings/master-data/stores', icon: '🏪', detail: 'Store locations, connections and integration settings' },
      ],
    },
    {
      title: 'System & Security',
      description: 'Notification, access and audit controls for CentralHub.',
      items: [
        { name: 'Notifications', href: '/settings/notifications', icon: '🔔', detail: 'Phone alerts, notification preferences and delivery controls' },
        { name: 'User Management', href: '/settings/users', icon: '👥', detail: 'Admin, staff, roles and permissions' },
        { name: 'Audit Logs', href: '/inventory-management/reports/audit', icon: '📜', detail: 'Inventory and operational audit history' },
      ],
    },
  ];

  return (
    <div className="space-y-8 pb-28">
      <div>
        <h2 className="mb-2 text-2xl font-bold text-white">Settings & Administration</h2>
        <p className="max-w-3xl text-slate-400">System configuration, business partners, stores, alerts, users and audit controls. Product categories and brands now live only in the Products workspace.</p>
      </div>

      <QuickShortcutsSettings />

      <div className="grid grid-cols-1 gap-8">
        {sections.map(section => (
          <section key={section.title} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{section.title}</h3>
              <p className="text-sm text-slate-500">{section.description}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.items.map(item => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="group flex min-h-24 items-center rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition-all hover:border-blue-500/50 hover:bg-slate-900/75"
                >
                  <div className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-2xl transition-colors group-hover:bg-blue-500/20">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white transition-colors group-hover:text-blue-400">{item.name}</div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-500">{item.detail}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
