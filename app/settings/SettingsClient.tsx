'use client';

import Link from 'next/link';
import QuickShortcutsSettings from './QuickShortcutsSettings';

export default function SettingsOverviewPage({ params, searchParams }: { params: any; searchParams: any }) {
  const sections = [
    {
      title: 'Master Data',
      description: 'Manage core system entities like categories, brands, and suppliers.',
      items: [
        { name: 'Categories', href: '/settings/master-data/categories', icon: '📁', count: 'Main product groupings' },
        { name: 'Brands', href: '/settings/master-data/brands', icon: '🏷️', count: 'Product manufacturers' },
        { name: 'Suppliers', href: '/settings/master-data/suppliers', icon: '🏭', count: 'Procurement partners' },
        { name: 'Stores', href: '/settings/master-data/stores', icon: '🏪', count: 'Retail locations' },
      ]
    },
    {
      title: 'System & Security',
      description: 'Configure system-wide settings and user permissions.',
      items: [
        { name: 'User Management', href: '/settings/users', icon: '👥', count: 'Admin & staff access' },
        { name: 'Audit Logs', href: '/inventory-management/reports/audit', icon: '📜', count: 'Inventory and operational audit history' },
      ]
    }
  ];

  return (
    <div className="space-y-8 pb-28">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Settings & Master Data</h2>
        <p className="text-slate-400">Configure your system and manage core business entities.</p>
      </div>

      <QuickShortcutsSettings />

      <div className="grid grid-cols-1 gap-8">
        {sections.map((section) => (
          <div key={section.title} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{section.title}</h3>
              <p className="text-sm text-slate-500">{section.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.items.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center p-4 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-blue-500/50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl mr-4 group-hover:bg-blue-500/20 transition-colors">
                    {item.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.count}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}